using System.Text.Json;
using System.Runtime.InteropServices;
using System.Security.Principal;
using LibreHardwareMonitor.Hardware;

sealed class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware)
    {
        hardware.Update();
        foreach (var subHardware in hardware.SubHardware) subHardware.Accept(this);
    }
    public void VisitParameter(IParameter parameter) { }
    public void VisitSensor(ISensor sensor) { }
}

static class Program
{
    static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    [StructLayout(LayoutKind.Sequential)]
    struct ProcessorPowerInformation
    {
        public uint Number;
        public uint MaxMhz;
        public uint CurrentMhz;
        public uint MhzLimit;
        public uint MaxIdleState;
        public uint CurrentIdleState;
    }

    [DllImport("powrprof.dll", SetLastError = true)]
    static extern uint CallNtPowerInformation(int informationLevel, IntPtr inputBuffer,
        uint inputBufferSize, IntPtr outputBuffer, uint outputBufferSize);

    static List<float> WindowsProcessorClocks()
    {
        var count = Environment.ProcessorCount;
        var itemSize = Marshal.SizeOf<ProcessorPowerInformation>();
        var buffer = Marshal.AllocHGlobal(itemSize * count);
        try
        {
            if (CallNtPowerInformation(11, IntPtr.Zero, 0, buffer, (uint)(itemSize * count)) != 0) return [];
            var result = new List<float>(count);
            for (var index = 0; index < count; index++)
            {
                var item = Marshal.PtrToStructure<ProcessorPowerInformation>(buffer + index * itemSize);
                if (item.CurrentMhz > 0) result.Add(item.CurrentMhz);
            }
            return result;
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PdhFormattedCounterValue
    {
        public uint Status;
        public double Value;
    }

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern uint PdhOpenQuery(string? dataSource, IntPtr userData, out IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern uint PdhAddEnglishCounter(IntPtr query, string counterPath, IntPtr userData, out IntPtr counter);
    [DllImport("pdh.dll")] static extern uint PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll")] static extern uint PdhGetFormattedCounterValue(IntPtr counter, uint format,
        out uint counterType, out PdhFormattedCounterValue value);
    [DllImport("pdh.dll")] static extern uint PdhCloseQuery(IntPtr query);

    sealed class EffectiveClockCounter : IDisposable
    {
        IntPtr query;
        IntPtr counter;
        readonly float nominalMhz;

        public EffectiveClockCounter()
        {
            nominalMhz = WindowsProcessorClocks().DefaultIfEmpty(0).Max();
            if (PdhOpenQuery(null, IntPtr.Zero, out query) != 0) return;
            if (PdhAddEnglishCounter(query, @"\Processor Information(_Total)\% Processor Performance",
                IntPtr.Zero, out counter) != 0) { PdhCloseQuery(query); query = IntPtr.Zero; return; }
            PdhCollectQueryData(query);
            Thread.Sleep(250);
        }

        public float? ReadMhz()
        {
            if (query == IntPtr.Zero || nominalMhz <= 0 || PdhCollectQueryData(query) != 0) return null;
            const uint PdhFormatDouble = 0x00000200;
            if (PdhGetFormattedCounterValue(counter, PdhFormatDouble, out _, out var value) != 0 ||
                value.Status != 0 || value.Value <= 0) return null;
            return (float)(nominalMhz * value.Value / 100d);
        }

        public void Dispose() { if (query != IntPtr.Zero) PdhCloseQuery(query); }
    }

    static object? BestSensorWithMinimum(IEnumerable<ISensor> sensors, SensorType type, float minimum, params string[] preferredNames)
    {
        var candidates = sensors.Where(s => s.SensorType == type && s.Value.HasValue && s.Value.Value >= minimum).ToList();
        if (candidates.Count == 0) return null;
        var selected = preferredNames
            .Select(name => candidates.FirstOrDefault(s =>
                s.Name.Contains(name, StringComparison.OrdinalIgnoreCase) ||
                s.Hardware.Name.Contains(name, StringComparison.OrdinalIgnoreCase)))
            .FirstOrDefault(s => s is not null) ?? candidates.OrderByDescending(s => s.Value).First();
        return new { value = Math.Round(selected.Value!.Value, 1), source = $"{selected.Hardware.Name} · {selected.Name}" };
    }

    static List<object> SensorPayloads(IEnumerable<ISensor> sensors, SensorType type, float minimum)
    {
        return sensors
            .Where(s => s.SensorType == type && s.Value.HasValue && s.Value.Value >= minimum)
            .OrderBy(s => s.Hardware.Name)
            .ThenBy(s => s.Name)
            .Select(s => new
            {
                value = Math.Round(s.Value!.Value, 1),
                source = $"{s.Hardware.Name} Â· {s.Name}",
                hardware = s.Hardware.Name,
                name = s.Name,
                type = s.SensorType.ToString()
            })
            .Cast<object>()
            .ToList();
    }

    static object? BestSensor(IEnumerable<ISensor> sensors, SensorType type, params string[] preferredNames) =>
        BestSensorWithMinimum(sensors, type, 0.01f, preferredNames);

    static object? BestFanSensor(IEnumerable<ISensor> sensors, SensorType type, params string[] preferredNames) =>
        BestSensorWithMinimum(sensors, type, 0f, preferredNames);

    static bool IsCpuRelatedHardware(IHardware hardware)
    {
        var type = hardware.HardwareType.ToString();
        return type.Contains("Cpu", StringComparison.OrdinalIgnoreCase) ||
            type.Contains("Motherboard", StringComparison.OrdinalIgnoreCase) ||
            type.Contains("Controller", StringComparison.OrdinalIgnoreCase) ||
            type.Contains("SuperIO", StringComparison.OrdinalIgnoreCase) ||
            type.Contains("Embedded", StringComparison.OrdinalIgnoreCase);
    }

    static bool MatchesAny(ISensor sensor, params string[] preferredNames) =>
        preferredNames.Any(name =>
            sensor.Name.Contains(name, StringComparison.OrdinalIgnoreCase) ||
            sensor.Hardware.Name.Contains(name, StringComparison.OrdinalIgnoreCase));

    static IEnumerable<IHardware> Flatten(IHardware hardware)
    {
        yield return hardware;
        foreach (var child in hardware.SubHardware)
            foreach (var nested in Flatten(child)) yield return nested;
    }

    public static async Task<int> Main(string[] args)
    {
        var once = args.Contains("--once", StringComparer.OrdinalIgnoreCase);
        var outputIndex = Array.FindIndex(args, value => value.Equals("--output", StringComparison.OrdinalIgnoreCase));
        var reportIndex = Array.FindIndex(args, value => value.Equals("--report", StringComparison.OrdinalIgnoreCase));
        var snapshotIndex = Array.FindIndex(args, value => value.Equals("--snapshot", StringComparison.OrdinalIgnoreCase));
        var snapshotPath = snapshotIndex >= 0 && snapshotIndex + 1 < args.Length ? args[snapshotIndex + 1] : null;
        TextWriter output = outputIndex >= 0 && outputIndex + 1 < args.Length
            ? new StreamWriter(args[outputIndex + 1], false) { AutoFlush = true }
            : Console.Out;
        var computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMotherboardEnabled = true,
            IsControllerEnabled = true
        };

        try
        {
            computer.Open();
            var visitor = new UpdateVisitor();
            using var effectiveClock = new EffectiveClockCounter();
            while (true)
            {
                computer.Accept(visitor);
                if (reportIndex >= 0 && reportIndex + 1 < args.Length)
                    File.WriteAllText(args[reportIndex + 1], computer.GetReport());
                var allHardware = computer.Hardware.SelectMany(Flatten).ToList();
                var cpus = allHardware.Where(h => h.HardwareType == HardwareType.Cpu).ToList();
                var sensors = cpus.SelectMany(h => h.Sensors).Where(s => s.Value.HasValue).ToList();
                var boardSensors = allHardware
                    .Where(IsCpuRelatedHardware)
                    .SelectMany(h => h.Sensors)
                    .Where(s => s.Value.HasValue)
                    .ToList();
                var temperatures = boardSensors.Where(s => s.SensorType == SensorType.Temperature && s.Value is > 0 and < 125).ToList();
                var packageTemp = temperatures.FirstOrDefault(s =>
                    MatchesAny(s, "CPU Package", "Package", "CPU Core", "Core", "Tctl", "Tdie", "CPU"));
                var temperature = packageTemp?.Value ?? temperatures.Select(s => s.Value).Max();
                var temperatureSource = packageTemp?.Name ?? (temperatures.Count > 0 ? "Máximo de núcleos" : null);

                var hardwareClocks = sensors.Where(s => s.SensorType == SensorType.Clock && s.Value is > 100 &&
                    !s.Name.Contains("Bus", StringComparison.OrdinalIgnoreCase)).Select(s => s.Value!.Value).ToList();
                var windowsClocks = WindowsProcessorClocks();
                var effectiveMhz = effectiveClock.ReadMhz();
                var clocks = hardwareClocks.Count > 0 ? hardwareClocks :
                    effectiveMhz.HasValue ? [effectiveMhz.Value] : windowsClocks;
                var power = BestSensor(boardSensors, SensorType.Power, "CPU Package", "Package", "CPU", "Cores", "IA");
                var fan = BestFanSensor(boardSensors, SensorType.Fan, "CPU Fan", "CPU_OPT", "CPU Optional", "CPU", "Processor", "Fan") ??
                    BestFanSensor(boardSensors, SensorType.Control, "CPU Fan", "CPU_OPT", "CPU Optional", "CPU", "Processor", "Fan");
                var fans = SensorPayloads(boardSensors, SensorType.Fan, 0f)
                    .Concat(SensorPayloads(boardSensors, SensorType.Control, 0f))
                    .ToList();

                var gpuPayload = computer.Hardware.SelectMany(Flatten)
                    .Where(h => h.HardwareType.ToString().StartsWith("Gpu", StringComparison.OrdinalIgnoreCase))
                    .Select(gpu =>
                    {
                        var gpuSensors = Flatten(gpu).SelectMany(h => h.Sensors).Where(s => s.Value.HasValue).ToList();
                        var hardwareType = gpu.HardwareType.ToString();
                        var vendor = hardwareType.Contains("Nvidia", StringComparison.OrdinalIgnoreCase) ? "NVIDIA" :
                            hardwareType.Contains("Amd", StringComparison.OrdinalIgnoreCase) ? "AMD" :
                            hardwareType.Contains("Intel", StringComparison.OrdinalIgnoreCase) ? "Intel" : hardwareType;
                        return new
                        {
                            model = gpu.Name,
                            vendor,
                            temperature = BestSensor(gpuSensors, SensorType.Temperature, "GPU Core", "Core", "GPU"),
                            load = BestSensor(gpuSensors, SensorType.Load, "GPU Core", "Core", "GPU"),
                            clock = BestSensor(gpuSensors, SensorType.Clock, "GPU Core", "Core", "Graphics"),
                            fan = BestFanSensor(gpuSensors, SensorType.Fan, "GPU Fan", "Fan") ??
                                BestFanSensor(gpuSensors, SensorType.Control, "GPU Fan", "Fan"),
                            power = BestSensor(gpuSensors, SensorType.Power, "GPU Package", "GPU Power", "Total")
                        };
                    }).ToList();

                var payload = new
                {
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    available = cpus.Count > 0,
                    elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),
                    cpu = new
                    {
                        model = cpus.FirstOrDefault()?.Name,
                        temperature = temperature.HasValue ? Math.Round(temperature.Value, 1) : (double?)null,
                        temperatureSource,
                        clock = clocks.Count > 0 ? Math.Round(clocks.Average(), 0) : (double?)null,
                        clockMin = clocks.Count > 0 ? Math.Round(clocks.Min(), 0) : (double?)null,
                        clockMax = clocks.Count > 0 ? Math.Round(clocks.Max(), 0) : (double?)null,
                        clockSource = hardwareClocks.Count > 0 ? "LibreHardwareMonitor · núcleos" :
                            effectiveMhz.HasValue ? "Windows · Processor Performance" :
                            windowsClocks.Count > 0 ? "Windows · NtPowerInformation" : null,
                        power,
                        fan,
                        fans
                    },
                    gpus = gpuPayload
                };
                var json = JsonSerializer.Serialize(payload, JsonOptions);
                if (!string.IsNullOrWhiteSpace(snapshotPath))
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(snapshotPath)!);
                    var temporaryPath = snapshotPath + ".tmp";
                    await File.WriteAllTextAsync(temporaryPath, json);
                    File.Move(temporaryPath, snapshotPath, true);
                }
                else
                {
                    await output.WriteLineAsync(json);
                    await output.FlushAsync();
                }
                if (once) break;
                await Task.Delay(1000);
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new { error = error.Message }, JsonOptions));
            return 1;
        }
        finally
        {
            computer.Close();
            if (!ReferenceEquals(output, Console.Out)) output.Dispose();
        }
    }
}
