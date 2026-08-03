$l = [System.IO.File]::ReadAllBytes('F:\datamodel\lor-card-game\tools\patch-launcher.exe');
$z = [System.IO.File]::ReadAllBytes('F:\datamodel\lor-card-game\tools\.patch-work\patch.zip');
$s = [BitConverter]::GetBytes([long]$z.Length);
$r = New-Object byte[]($l.Length + $z.Length + 8);
[Buffer]::BlockCopy($l, 0, $r, 0, $l.Length);
[Buffer]::BlockCopy($z, 0, $r, $l.Length, $z.Length);
[Buffer]::BlockCopy($s, 0, $r, $l.Length + $z.Length, 8);
[System.IO.File]::WriteAllBytes('F:\datamodel\lor-card-game\release\patch-v1.0.4.exe', $r);
Write-Host ('OK: ' + $r.Length)
