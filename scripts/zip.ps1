param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$parent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Source))
# ZipFile includes dotfiles such as .github/.gitignore, unlike Compress-Archive on some systems.
$archive = [IO.Compression.ZipFile]::Open($Destination,[IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $Source -File -Recurse -Force | ForEach-Object {
    $entry = $_.FullName.Substring($parent.Length + 1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
