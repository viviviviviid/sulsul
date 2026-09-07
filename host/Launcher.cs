using System;
using System.IO;
using System.Diagnostics;
using System.Threading.Tasks;

// A windowless Windows Native Messaging host. Chrome owns its stdin/stdout pipes.
class Launcher {
  static string Quote(string s) { return "\"" + s.Replace("\"", "\\\"") + "\""; }
  static async Task Pump(Stream source, Stream target) {
    byte[] buffer = new byte[8192];
    int length;
    while ((length = await source.ReadAsync(buffer, 0, buffer.Length)) > 0) {
      await target.WriteAsync(buffer, 0, length);
      await target.FlushAsync();
    }
  }
  static int Main(string[] args) {
    try {
      string dir = AppDomain.CurrentDomain.BaseDirectory;
      string node = File.ReadAllText(Path.Combine(dir, "node-path.txt")).Trim();
      var start = new ProcessStartInfo(node, Quote(Path.Combine(dir, "host.mjs")) + " " + (args.Length > 0 ? Quote(args[0]) : ""));
      start.UseShellExecute = false;
      start.CreateNoWindow = true;
      start.WindowStyle = ProcessWindowStyle.Hidden;
      start.WorkingDirectory = dir;
      start.RedirectStandardInput = true;
      start.RedirectStandardOutput = true;
      start.RedirectStandardError = true;
      using (var child = Process.Start(start)) {
        var input = Task.Run(async () => { try { await Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream); } catch {} finally { try { child.StandardInput.Close(); } catch {} } });
        var output = Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
        child.StandardError.BaseStream.CopyToAsync(Stream.Null);
        child.WaitForExit();
        output.Wait();
        return child.ExitCode;
      }
    } catch { return 1; }
  }
}
