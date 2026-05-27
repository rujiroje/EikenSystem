using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Text.Json;
using DPUruNet;

var builder = WebApplication.CreateBuilder(args);

// 1) CORS: อนุญาตให้ React dev server เรียกได้
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactDev", policy =>
    {
        policy
            .WithOrigins("http://localhost:3000", "http://localhost:5173") // CRA / Vite
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// 2) ลงทะเบียน Service สำหรับเครื่องสแกนนิ้ว (Dependency Injection)
// เปลี่ยน MockFingerprintService เป็น Service จริงเมื่อมี SDK
// builder.Services.AddSingleton<IFingerprintService, MockFingerprintService>();
builder.Services.AddSingleton<IFingerprintService, DigitalPersonaService>();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseCors("ReactDev");

// 3) Health check: ตรวจสอบสถานะอุปกรณ์
app.MapGet("/health", (IFingerprintService bioService) => 
    Results.Ok(new { ok = true, service = "KioskBioAgent", deviceStatus = bioService.GetStatus() }));

// 4) Endpoint สำหรับเริ่มกระบวนการสแกน
app.MapPost("/authenticate", async (HttpContext ctx, IFingerprintService bioService) =>
{
    try 
    {
        // 1.1) ตั้งค่าให้รับ JSON ตัวพิมพ์เล็ก/ใหญ่ได้ (Case Insensitive) แก้ปัญหา 400 Bad Request
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var req = await JsonSerializer.DeserializeAsync<AuthRequest>(ctx.Request.Body, options);

        if (req is null || string.IsNullOrWhiteSpace(req.Challenge))
            return Results.BadRequest(new { ok = false, error = "challenge_required" });

        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Request received. Challenge: {req.Challenge}");

        // เรียกใช้ Service เพื่อสแกนนิ้ว
        var scanResult = await bioService.CaptureAndSignAsync(req.Challenge);
        
        return Results.Ok(new
        {
            ok = true,
            challenge = req.Challenge,
            signedData = scanResult.SignedData, // หรือ Fingerprint Template
            device = scanResult.DeviceName,
            ts = DateTimeOffset.UtcNow
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Error: {ex.Message}");
        return Results.Problem($"Error: {ex.Message}");
    }
});

// 5) Endpoint สำหรับระบุตัวตน (Identify)
app.MapPost("/identify", async (HttpContext ctx, IFingerprintService bioService) =>
{
    try 
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var req = await JsonSerializer.DeserializeAsync<IdentifyRequest>(ctx.Request.Body, options);

        if (req is null || req.Candidates == null || req.Candidates.Count == 0)
            return Results.BadRequest(new { ok = false, error = "candidates_required" });

        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Identify Request. Candidates: {req.Candidates.Count}");

        var matchId = await bioService.IdentifyAsync(req.Challenge, req.Candidates);
        
        return Results.Ok(new { ok = true, matchId = matchId });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Error: {ex.Message}");
        return Results.Problem($"Error: {ex.Message}");
    }
});

try
{
    Console.WriteLine("Starting KiosAgent on https://localhost:5001 ...");
    
    // รัน Server แบบ Background Task
    var serverTask = app.RunAsync("https://localhost:5001");

    // --- ส่วนควบคุมผ่าน Console ---
    Console.WriteLine("\n==================================================");
    Console.WriteLine("  KiosAgent is RUNNING");
    Console.WriteLine("  [C] Check Readers (ตรวจสอบอุปกรณ์)");
    Console.WriteLine("  [T] Test Capture (ทดสอบสแกนนิ้ว)");
    Console.WriteLine("  [Q] Quit (ออกจากโปรแกรม)");
    Console.WriteLine("==================================================\n");

    // ตรวจสอบอุปกรณ์ครั้งแรกทันที
    CheckReaders();

    while (true)
    {
        if (Console.KeyAvailable)
        {
            var key = Console.ReadKey(true).Key;
            if (key == ConsoleKey.Q)
            {
                Console.WriteLine("Stopping...");
                await app.StopAsync();
                await serverTask;
                break;
            }
            else if (key == ConsoleKey.C)
            {
                CheckReaders();
            }
            else if (key == ConsoleKey.T)
            {
                await TestCapture();
            }
        }
        await Task.Delay(200);
    }
}
catch (Exception ex)
{
    Console.WriteLine("\n--------------------------------------------------");
    Console.WriteLine($"CRITICAL ERROR: {ex.Message}");
    Console.WriteLine("--------------------------------------------------");
    Console.WriteLine("Press Enter to close...");
    Console.ReadLine();
}

// --- ฟังก์ชันสำหรับทดสอบใน Console ---
void CheckReaders()
{
    try
    {
        Console.WriteLine("Checking readers...");
        var readers = ReaderCollection.GetReaders();
        if (readers.Count == 0) Console.WriteLine("-> ❌ No readers found. (ไม่พบอุปกรณ์)");
        else
        {
            foreach (Reader r in readers)
                Console.WriteLine($"-> ✅ Found: {r.Description.Name} (SN: {r.Description.SerialNumber})");
        }
    }
    catch (Exception ex) { Console.WriteLine($"-> Error checking readers: {ex.Message}"); }
}

async Task TestCapture()
{
    Console.WriteLine("\n--- TEST CAPTURE START ---");
    await Task.Run(() => {
        try {
            var readers = ReaderCollection.GetReaders();
            if (readers.Count == 0) { Console.WriteLine("❌ No reader found."); return; }
            
            var reader = readers[0];
            Console.WriteLine($"Using: {reader.Description.Name}");

            // เปลี่ยนเป็น EXCLUSIVE เพื่อยึดอุปกรณ์ (แก้ปัญหา Timeout เพราะไม่ได้ Focus หน้าต่าง)
            if (reader.Open(Constants.CapturePriority.DP_PRIORITY_EXCLUSIVE) != Constants.ResultCode.DP_SUCCESS) {
                Console.WriteLine("❌ Open failed."); return;
            }
            try {
                // เช็คสถานะก่อนเริ่ม
                reader.GetStatus();
                Console.WriteLine($"   Device Status: {reader.Status.Status}");
                Console.WriteLine("👉 Place finger on sensor (วางนิ้วที่เครื่อง)...");
                
                // ใช้ ANSI + Default Process ตามที่เคยคุยกัน
                var res = reader.Capture(Constants.Formats.Fid.ANSI, Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT, 5000, reader.Capabilities.Resolutions[0]);
                
                if (res.ResultCode != Constants.ResultCode.DP_SUCCESS) {
                    Console.WriteLine($"❌ Capture Failed with error code: {res.ResultCode}");
                    return;
                }

                // ตรวจสอบคุณภาพของภาพสแกน
                if (res.Quality == Constants.CaptureQuality.DP_QUALITY_TIMED_OUT) {
                    Console.WriteLine("❌ Capture Timed Out. The sensor did not detect a finger within 5 seconds.");
                    Console.WriteLine("   -> Please check SDK/Driver installation or try the official sample app.");
                    return;
                }

                Console.WriteLine($"✅ Capture OK. Quality: {res.Quality}");
                if (res.Data != null) {
                    var fmd = FeatureExtraction.CreateFmdFromFid(res.Data, Constants.Formats.Fmd.ANSI);
                    Console.WriteLine($"   Extraction Result: {fmd.ResultCode}");
                    if (fmd.ResultCode == Constants.ResultCode.DP_SUCCESS) {
                        Console.WriteLine($"   Template Size: {fmd.Data.Bytes.Length} bytes");
                    }
                }
            } finally { reader.Dispose(); }
        } catch (Exception ex) { Console.WriteLine($"Exception: {ex.Message}"); }
    });
    Console.WriteLine("--- TEST CAPTURE END ---\n");
}

public record AuthRequest(string Challenge);
public record IdentifyRequest(string Challenge, List<Candidate> Candidates);
public record Candidate(string Username, string Template);

// --- ส่วนขยาย: Interface และ Mock Service ---

public interface IFingerprintService
{
    string GetStatus();
    Task<(string SignedData, string DeviceName)> CaptureAndSignAsync(string challenge);
    Task<string?> IdentifyAsync(string challenge, List<Candidate> candidates);
}

// --- Service ของจริงสำหรับ DigitalPersona ---
public class DigitalPersonaService : IFingerprintService
{
    public string GetStatus()
    {
        try
        {
            var readers = ReaderCollection.GetReaders();
            if (readers.Count > 0)
            {
                return $"Connected: {readers[0].Description.Name} (SN: {readers[0].Description.SerialNumber})";
            }
            return "Device not found";
        }
        catch (Exception ex)
        {
            return $"Error checking status: {ex.Message}";
        }
    }

    public async Task<(string SignedData, string DeviceName)> CaptureAndSignAsync(string challenge)
    {
        return await Task.Run(() =>
        {
            var readers = ReaderCollection.GetReaders();
            if (readers.Count == 0) throw new Exception("No fingerprint reader found.");

            var reader = readers[0];
            
            // เปิดการเชื่อมต่อ
            // เปลี่ยนเป็น EXCLUSIVE สำหรับ Service จริงด้วย
            if (reader.Open(Constants.CapturePriority.DP_PRIORITY_EXCLUSIVE) != Constants.ResultCode.DP_SUCCESS)
            {
                throw new Exception("Cannot open reader.");
            }

            try
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Waiting for finger...");
                
                // ใช้การตั้งค่าเดียวกับ TestCapture ที่ทดสอบผ่านแล้ว (ANSI + Default + Resolution[0])
                var result = reader.Capture(Constants.Formats.Fid.ANSI, Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT, 5000, reader.Capabilities.Resolutions[0]);

                if (result.ResultCode != Constants.ResultCode.DP_SUCCESS)
                {
                    throw new Exception($"Capture failed: {result.ResultCode}");
                }

                // 3. ตรวจสอบคุณภาพของภาพที่ได้
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Capture Success. Quality: {result.Quality}");
                if (result.Data == null) throw new Exception("Capture returned null data.");

                // สร้าง FMD (template) จากข้อมูลลายนิ้วมือ (FID) เพื่อใช้ในการตรวจสอบ
                var fmdResult = FeatureExtraction.CreateFmdFromFid(result.Data, Constants.Formats.Fmd.ANSI);
                if (fmdResult.ResultCode != Constants.ResultCode.DP_SUCCESS)
                {
                    throw new Exception($"Feature extraction failed: {fmdResult.ResultCode} (Quality: {result.Quality})");
                }
                // แปลง FMD เป็น Base64 เพื่อส่งกลับ
                return (Convert.ToBase64String(fmdResult.Data.Bytes), reader.Description.Name);
            }
            finally { reader.Dispose(); }
        });
    }

    public async Task<string?> IdentifyAsync(string challenge, List<Candidate> candidates)
    {
        return await Task.Run(() =>
        {
            var readers = ReaderCollection.GetReaders();
            if (readers.Count == 0) throw new Exception("No fingerprint reader found.");
            var reader = readers[0];

            if (reader.Open(Constants.CapturePriority.DP_PRIORITY_EXCLUSIVE) != Constants.ResultCode.DP_SUCCESS)
                throw new Exception("Cannot open reader.");

            try
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Waiting for finger to identify...");
                // Capture
                var result = reader.Capture(Constants.Formats.Fid.ANSI, Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT, 5000, reader.Capabilities.Resolutions[0]);
                if (result.ResultCode != Constants.ResultCode.DP_SUCCESS) throw new Exception($"Capture failed: {result.ResultCode}");

                // Create FMD from captured finger
                var fmdResult = FeatureExtraction.CreateFmdFromFid(result.Data, Constants.Formats.Fmd.ANSI);
                if (fmdResult.ResultCode != Constants.ResultCode.DP_SUCCESS) throw new Exception("Feature extraction failed");
                var capturedFmd = fmdResult.Data;

                // Prepare Candidates FMDs
                var fmdList = new List<Fmd>();
                var userMap = new Dictionary<int, string>();
                int idx = 0;
                foreach (var c in candidates) {
                    try {
                        var bytes = Convert.FromBase64String(c.Template);
                        var importRes = Importer.ImportFmd(bytes, Constants.Formats.Fmd.ANSI, Constants.Formats.Fmd.ANSI);
                        if (importRes.ResultCode == Constants.ResultCode.DP_SUCCESS) {
                            fmdList.Add(importRes.Data);
                            userMap[idx++] = c.Username;
                        }
                    } catch { /* Skip invalid templates */ }
                }

                if (fmdList.Count == 0) return null;

                // Identify (Threshold 2147 = Standard FAR)
                var identifyResult = Comparison.Identify(capturedFmd, 0, fmdList, 2147, 1);
                if (identifyResult.ResultCode == Constants.ResultCode.DP_SUCCESS && identifyResult.Indexes.Length > 0 && identifyResult.Indexes[0].Length > 0) {
                    return userMap[identifyResult.Indexes[0][0]]; // Return matched username
                }
                return null;
            }
            finally { reader.Dispose(); }
        });
    }
}

public class MockFingerprintService : IFingerprintService
{
    public string GetStatus() => "Connected (Mock Device)";

    public async Task<(string SignedData, string DeviceName)> CaptureAndSignAsync(string challenge)
    {
        // TODO: ใส่ Code ของ SDK เครื่องสแกนนิ้วตรงนี้
        // เช่น: device.Capture(), device.GetTemplate()
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Mocking fingerprint scan... (Waiting 700ms)");
        
        await Task.Delay(700); // จำลองเวลาสแกน
        
        // คืนค่าเป็น Mock Data (ในของจริงอาจจะเป็น Base64 Template)
        return (Convert.ToBase64String(Guid.NewGuid().ToByteArray()), Environment.MachineName);
    }

    public async Task<string?> IdentifyAsync(string challenge, List<Candidate> candidates)
    {
        await Task.Delay(700);
        // Mock: คืนค่าคนแรกในรายการเสมอ
        return candidates.Count > 0 ? candidates[0].Username : null;
    }
}
