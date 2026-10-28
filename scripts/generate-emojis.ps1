Add-Type -AssemblyName System.Drawing

$OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) "bot\assets\emojis"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Size = 128
$Red = [System.Drawing.Color]::FromArgb(255, 237, 66, 69)
$Dark = [System.Drawing.Color]::FromArgb(255, 27, 28, 31)
$White = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)

function Draw-Text {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [string]$Text,
    [float]$FontSize
  )

  $font = New-Object System.Drawing.Font("Segoe UI", $FontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
  $Graphics.DrawString($Text, $font, $Brush, $rect, $format)
  $format.Dispose()
  $font.Dispose()
}

function Draw-Check {
  param($g, $pen)
  $pen.Width = 10
  $g.DrawLine($pen, 38, 66, 56, 84)
  $g.DrawLine($pen, 56, 84, 92, 44)
}

function Draw-Cross {
  param($g, $pen)
  $pen.Width = 10
  $g.DrawLine($pen, 42, 42, 86, 86)
  $g.DrawLine($pen, 86, 42, 42, 86)
}

function Draw-Warning {
  param($g, $brush, $pen)
  $points = @(
    (New-Object System.Drawing.PointF(64, 28)),
    (New-Object System.Drawing.PointF(100, 96)),
    (New-Object System.Drawing.PointF(28, 96))
  )
  $g.DrawPolygon($pen, $points)
  $g.DrawLine($pen, 64, 50, 64, 74)
  $g.FillEllipse($brush, 59, 82, 10, 10)
}

function Draw-Info {
  param($g, $brush, $pen)
  $g.DrawEllipse($pen, 32, 32, 64, 64)
  $g.FillEllipse($brush, 59, 40, 10, 10)
  $g.DrawLine($pen, 64, 58, 64, 84)
}

function Draw-Shield {
  param($g, $brush, $pen, $check)
  $points = @(
    (New-Object System.Drawing.PointF(64, 24)),
    (New-Object System.Drawing.PointF(98, 38)),
    (New-Object System.Drawing.PointF(94, 76)),
    (New-Object System.Drawing.PointF(64, 104)),
    (New-Object System.Drawing.PointF(34, 76)),
    (New-Object System.Drawing.PointF(30, 38))
  )
  $g.DrawPolygon($pen, $points)
  if ($check) {
    $pen.Width = 7
    $g.DrawLine($pen, 46, 64, 58, 76)
    $g.DrawLine($pen, 58, 76, 84, 48)
  }
}

function Draw-User {
  param($g, $brush)
  $g.FillEllipse($brush, 48, 34, 32, 32)
  $circle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $circle.AddEllipse(6, 6, 116, 116)
  $g.SetClip($circle)
  $g.FillEllipse($brush, 30, 72, 68, 48)
  $g.ResetClip()
  $circle.Dispose()
}

function Draw-UserPlus {
  param($g, $brush, $pen)
  $g.FillEllipse($brush, 42, 34, 28, 28)
  $circle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $circle.AddEllipse(6, 6, 116, 116)
  $g.SetClip($circle)
  $g.FillEllipse($brush, 24, 68, 62, 44)
  $g.ResetClip()
  $circle.Dispose()
  $pen.Width = 7
  $g.DrawLine($pen, 88, 52, 88, 78)
  $g.DrawLine($pen, 75, 65, 101, 65)
}

function Draw-Mention {
  param($g, $brush)
  Draw-Text $g $brush "@" 62
}

function Draw-Id {
  param($g, $brush)
  Draw-Text $g $brush "#" 60
}

function Draw-Hourglass {
  param($g, $pen)
  $g.DrawLine($pen, 40, 34, 88, 34)
  $g.DrawLine($pen, 40, 94, 88, 94)
  $g.DrawLine($pen, 44, 38, 84, 92)
  $g.DrawLine($pen, 84, 38, 44, 92)
}

function Draw-Star {
  param($g, $brush)
  $points = @(
    (New-Object System.Drawing.PointF(64, 22)),
    (New-Object System.Drawing.PointF(74, 52)),
    (New-Object System.Drawing.PointF(106, 52)),
    (New-Object System.Drawing.PointF(80, 70)),
    (New-Object System.Drawing.PointF(90, 102)),
    (New-Object System.Drawing.PointF(64, 82)),
    (New-Object System.Drawing.PointF(38, 102)),
    (New-Object System.Drawing.PointF(48, 70)),
    (New-Object System.Drawing.PointF(22, 52)),
    (New-Object System.Drawing.PointF(54, 52))
  )
  $g.FillPolygon($brush, $points)
}

function Draw-Ban {
  param($g, $pen)
  $g.DrawEllipse($pen, 28, 28, 72, 72)
  $g.DrawLine($pen, 40, 40, 88, 88)
}

function Draw-Kick {
  param($g, $pen)
  $pen.Width = 8
  $g.DrawLine($pen, 28, 64, 84, 64)
  $g.DrawLine($pen, 68, 46, 92, 64)
  $g.DrawLine($pen, 68, 82, 92, 64)
}

function Draw-Mute {
  param($g, $brush, $pen)
  $points = @(
    (New-Object System.Drawing.PointF(34, 54)),
    (New-Object System.Drawing.PointF(54, 54)),
    (New-Object System.Drawing.PointF(76, 36)),
    (New-Object System.Drawing.PointF(76, 92)),
    (New-Object System.Drawing.PointF(54, 74)),
    (New-Object System.Drawing.PointF(34, 74))
  )
  $g.FillPolygon($brush, $points)
  $pen.Width = 8
  $g.DrawLine($pen, 86, 44, 106, 84)
  $g.DrawLine($pen, 106, 44, 86, 84)
}

function Draw-Purge {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawLine($pen, 34, 42, 82, 42)
  $g.DrawLine($pen, 34, 64, 82, 64)
  $g.DrawLine($pen, 34, 86, 82, 86)
  $g.DrawLine($pen, 88, 42, 102, 64)
  $g.DrawLine($pen, 88, 86, 102, 64)
}

function Draw-Lock {
  param($g, $pen, $open)
  $pen.Width = 7
  $g.DrawRectangle($pen, 34, 62, 60, 44)
  if ($open) {
    $g.DrawArc($pen, 44, 30, 40, 46, 180, 180)
  } else {
    $g.DrawArc($pen, 44, 30, 40, 46, 180, 180)
    $g.DrawLine($pen, 44, 53, 44, 62)
    $g.DrawLine($pen, 84, 53, 84, 62)
  }
}

function Draw-Dot {
  param($g, $brush, $pen, $filled)
  if ($filled) {
    $g.FillEllipse($brush, 46, 46, 36, 36)
  } else {
    $g.DrawEllipse($pen, 46, 46, 36, 36)
  }
}

function Draw-Gear {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawEllipse($pen, 40, 40, 48, 48)
  $g.DrawEllipse($pen, 56, 56, 16, 16)
  for ($i = 0; $i -lt 8; $i++) {
    $angle = ($i * 45) * [Math]::PI / 180
    $x1 = 64 + [Math]::Cos($angle) * 30
    $y1 = 64 + [Math]::Sin($angle) * 30
    $x2 = 64 + [Math]::Cos($angle) * 42
    $y2 = 64 + [Math]::Sin($angle) * 42
    $g.DrawLine($pen, $x1, $y1, $x2, $y2)
  }
}

function Draw-Cloud {
  param($g, $brush)
  $g.FillEllipse($brush, 28, 56, 34, 34)
  $g.FillEllipse($brush, 46, 42, 42, 42)
  $g.FillEllipse($brush, 68, 56, 32, 32)
  $g.FillRectangle($brush, 38, 70, 52, 18)
}

function Draw-Bolt {
  param($g, $brush)
  $points = @(
    (New-Object System.Drawing.PointF(68, 20)),
    (New-Object System.Drawing.PointF(38, 68)),
    (New-Object System.Drawing.PointF(60, 68)),
    (New-Object System.Drawing.PointF(52, 108)),
    (New-Object System.Drawing.PointF(92, 54)),
    (New-Object System.Drawing.PointF(68, 54))
  )
  $g.FillPolygon($brush, $points)
}

function Draw-Crown {
  param($g, $brush)
  $points = @(
    (New-Object System.Drawing.PointF(26, 84)),
    (New-Object System.Drawing.PointF(34, 40)),
    (New-Object System.Drawing.PointF(54, 64)),
    (New-Object System.Drawing.PointF(64, 30)),
    (New-Object System.Drawing.PointF(74, 64)),
    (New-Object System.Drawing.PointF(94, 40)),
    (New-Object System.Drawing.PointF(102, 84))
  )
  $g.FillPolygon($brush, $points)
  $g.FillRectangle($brush, 26, 84, 76, 10)
}

function Draw-Party {
  param($g, $brush, $pen)
  Draw-Star $g $brush
  $g.FillEllipse($brush, 28, 28, 10, 10)
  $g.FillEllipse($brush, 92, 30, 8, 8)
  $g.FillEllipse($brush, 94, 88, 9, 9)
}

function Draw-Log {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawRectangle($pen, 34, 26, 60, 76)
  $g.DrawLine($pen, 48, 48, 80, 48)
  $g.DrawLine($pen, 48, 64, 80, 64)
  $g.DrawLine($pen, 48, 80, 72, 80)
}

function Draw-Box {
  param($g, $brush, $pen)
  $g.DrawRectangle($pen, 28, 52, 72, 52)
  $g.DrawLine($pen, 64, 52, 64, 104)
  $g.DrawLine($pen, 28, 70, 100, 70)
  $g.DrawArc($pen, 42, 30, 44, 32, 180, 180)
}

function Draw-Channel {
  param($g, $brush)
  Draw-Text $g $brush "#" 62
}

function Draw-Link {
  param($g, $pen)
  $pen.Width = 8
  $g.DrawArc($pen, 28, 44, 50, 40, 45, 220)
  $g.DrawArc($pen, 50, 44, 50, 40, 225, 220)
}

function Draw-Trash {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawRectangle($pen, 36, 44, 56, 62)
  $g.DrawLine($pen, 28, 44, 100, 44)
  $g.DrawLine($pen, 50, 30, 78, 30)
  $g.DrawLine($pen, 50, 30, 50, 44)
  $g.DrawLine($pen, 78, 30, 78, 44)
  $g.DrawLine($pen, 52, 58, 52, 92)
  $g.DrawLine($pen, 64, 58, 64, 92)
  $g.DrawLine($pen, 76, 58, 76, 92)
}

function Draw-Bell {
  param($g, $pen)
  $pen.Width = 7
  $points = @(
    (New-Object System.Drawing.PointF(64, 24)),
    (New-Object System.Drawing.PointF(94, 80)),
    (New-Object System.Drawing.PointF(34, 80))
  )
  $g.DrawPolygon($pen, $points)
  $g.DrawArc($pen, 48, 80, 32, 24, 0, 180)
  $g.DrawLine($pen, 64, 18, 64, 24)
}

function Draw-Server {
  param($g, $pen)
  $pen.Width = 6
  $g.DrawRectangle($pen, 34, 30, 60, 26)
  $g.DrawRectangle($pen, 34, 62, 60, 26)
  $g.DrawRectangle($pen, 34, 94, 60, 18)
  $g.DrawLine($pen, 44, 43, 50, 43)
  $g.DrawLine($pen, 44, 75, 50, 75)
}

function Draw-Chart {
  param($g, $brush)
  $g.FillRectangle($brush, 30, 70, 14, 34)
  $g.FillRectangle($brush, 54, 52, 14, 52)
  $g.FillRectangle($brush, 78, 36, 14, 68)
}

function Draw-Coin {
  param($g, $brush, $pen)
  $g.DrawEllipse($pen, 30, 30, 68, 68)
  Draw-Text $g $brush "$" 52
}

function Draw-Ticket {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawRectangle($pen, 26, 40, 76, 48)
  $g.DrawLine($pen, 44, 40, 44, 88)
  $g.DrawLine($pen, 84, 40, 84, 88)
}

function Draw-Pie {
  param($g, $brush, $pen)
  $g.DrawEllipse($pen, 32, 32, 64, 64)
  $g.FillPie($brush, 32, 32, 64, 64, 270, 90)
  $g.DrawLine($pen, 64, 64, 64, 32)
  $g.DrawLine($pen, 64, 64, 96, 64)
}

function Draw-IdCard {
  param($g, $brush, $pen)
  $g.DrawRectangle($pen, 24, 38, 80, 52)
  $g.FillEllipse($brush, 38, 52, 20, 20)
  $g.DrawLine($pen, 68, 54, 92, 54)
  $g.DrawLine($pen, 68, 70, 92, 70)
}

function Draw-Help {
  param($g, $brush)
  Draw-Text $g $brush "?" 62
}

function Draw-Ledger {
  param($g, $pen)
  $pen.Width = 7
  $g.DrawRectangle($pen, 30, 28, 68, 72)
  $g.DrawLine($pen, 44, 28, 44, 100)
  $g.DrawLine($pen, 54, 48, 84, 48)
  $g.DrawLine($pen, 54, 64, 84, 64)
  $g.DrawLine($pen, 54, 80, 76, 80)
}

function Draw-Search {
  param($g, $pen)
  $pen.Width = 8
  $g.DrawEllipse($pen, 30, 30, 48, 48)
  $g.DrawLine($pen, 70, 70, 96, 96)
}

function Draw-Clock {
  param($g, $brush, $pen)
  $g.DrawEllipse($pen, 30, 30, 68, 68)
  $g.DrawLine($pen, 64, 64, 64, 42)
  $g.DrawLine($pen, 64, 64, 84, 72)
  $g.FillEllipse($brush, 58, 58, 12, 12)
}

function Draw-Calendar {
  param($g, $pen)
  $pen.Width = 6
  $g.DrawRectangle($pen, 28, 34, 72, 66)
  $g.DrawLine($pen, 28, 52, 100, 52)
  $g.DrawLine($pen, 46, 24, 46, 42)
  $g.DrawLine($pen, 82, 24, 82, 42)
  $g.DrawLine($pen, 48, 68, 60, 68)
  $g.DrawLine($pen, 70, 68, 82, 68)
  $g.DrawLine($pen, 48, 82, 60, 82)
  $g.DrawLine($pen, 70, 82, 82, 82)
}

function Draw-Arrow {
  param($g, $pen)
  $pen.Width = 8
  $g.DrawLine($pen, 28, 64, 88, 64)
  $g.DrawLine($pen, 70, 46, 94, 64)
  $g.DrawLine($pen, 70, 82, 94, 64)
}

function Draw-Loading {
  param($g, $brush)
  $g.FillEllipse($brush, 30, 58, 12, 12)
  $g.FillEllipse($brush, 58, 58, 12, 12)
  $g.FillEllipse($brush, 86, 58, 12, 12)
}

function Draw-Radiation {
  param($g, $brush, $pen)
  $g.DrawEllipse($pen, 54, 54, 20, 20)
  $points1 = @(
    (New-Object System.Drawing.PointF(64, 64)),
    (New-Object System.Drawing.PointF(34, 28)),
    (New-Object System.Drawing.PointF(74, 28))
  )
  $points2 = @(
    (New-Object System.Drawing.PointF(64, 64)),
    (New-Object System.Drawing.PointF(98, 78)),
    (New-Object System.Drawing.PointF(78, 108))
  )
  $points3 = @(
    (New-Object System.Drawing.PointF(64, 64)),
    (New-Object System.Drawing.PointF(30, 78)),
    (New-Object System.Drawing.PointF(50, 108))
  )
  $g.FillPolygon($brush, $points1)
  $g.FillPolygon($brush, $points2)
  $g.FillPolygon($brush, $points3)
}

function New-Icon {
  param(
    [string]$Name,
    [scriptblock]$Draw
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $redBrush = New-Object System.Drawing.SolidBrush($Red)
  $darkPen = New-Object System.Drawing.Pen($Dark, 4)
  $graphics.FillEllipse($redBrush, 6, 6, 116, 116)
  $graphics.DrawEllipse($darkPen, 6, 6, 116, 116)

  $whiteBrush = New-Object System.Drawing.SolidBrush($White)
  $whitePen = New-Object System.Drawing.Pen($White, 8)
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  & $Draw $graphics $whiteBrush $whitePen

  $path = Join-Path $OutDir ($Name + ".png")
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $whitePen.Dispose()
  $whiteBrush.Dispose()
  $darkPen.Dispose()
  $redBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

# General
New-Icon -Name "zyron_success" -Draw { param($g, $brush, $pen) Draw-Check $g $pen }
New-Icon -Name "zyron_error" -Draw { param($g, $brush, $pen) Draw-Cross $g $pen }
New-Icon -Name "zyron_warning" -Draw { param($g, $brush, $pen) Draw-Warning $g $brush $pen }
New-Icon -Name "zyron_info" -Draw { param($g, $brush, $pen) Draw-Info $g $brush $pen }
New-Icon -Name "zyron_shield" -Draw { param($g, $brush, $pen) Draw-Shield $g $brush $pen $false }
New-Icon -Name "zyron_user" -Draw { param($g, $brush, $pen) Draw-User $g $brush }
New-Icon -Name "zyron_added_by" -Draw { param($g, $brush, $pen) Draw-UserPlus $g $brush $pen }
New-Icon -Name "zyron_mention" -Draw { param($g, $brush, $pen) Draw-Mention $g $brush }
New-Icon -Name "zyron_id" -Draw { param($g, $brush, $pen) Draw-Id $g $brush }
New-Icon -Name "zyron_expiry" -Draw { param($g, $brush, $pen) Draw-Hourglass $g $pen }
New-Icon -Name "zyron_star" -Draw { param($g, $brush, $pen) Draw-Star $g $brush }

# Security and moderation
New-Icon -Name "zyron_ban" -Draw { param($g, $brush, $pen) Draw-Ban $g $pen }
New-Icon -Name "zyron_kick" -Draw { param($g, $brush, $pen) Draw-Kick $g $pen }
New-Icon -Name "zyron_mute" -Draw { param($g, $brush, $pen) Draw-Mute $g $brush $pen }
New-Icon -Name "zyron_warn" -Draw { param($g, $brush, $pen) Draw-Warning $g $brush $pen }
New-Icon -Name "zyron_warn_alt" -Draw { param($g, $brush, $pen) Draw-Warning $g $brush $pen }
New-Icon -Name "zyron_purge" -Draw { param($g, $brush, $pen) Draw-Purge $g $pen }
New-Icon -Name "zyron_purge_alt" -Draw { param($g, $brush, $pen) Draw-Purge $g $pen }
New-Icon -Name "zyron_lock" -Draw { param($g, $brush, $pen) Draw-Lock $g $pen $false }
New-Icon -Name "zyron_unlock" -Draw { param($g, $brush, $pen) Draw-Lock $g $pen $true }
New-Icon -Name "zyron_online" -Draw { param($g, $brush, $pen) Draw-Dot $g $brush $pen $true }
New-Icon -Name "zyron_offline" -Draw { param($g, $brush, $pen) Draw-Dot $g $brush $pen $false }
New-Icon -Name "zyron_disabled" -Draw { param($g, $brush, $pen) Draw-Cross $g $pen }
New-Icon -Name "zyron_settings" -Draw { param($g, $brush, $pen) Draw-Gear $g $pen }
New-Icon -Name "zyron_backup" -Draw { param($g, $brush, $pen) Draw-Cloud $g $brush }
New-Icon -Name "zyron_ai" -Draw { param($g, $brush, $pen) Draw-Text $g $brush "AI" 44 }
New-Icon -Name "zyron_lightning" -Draw { param($g, $brush, $pen) Draw-Bolt $g $brush }

# Utility
New-Icon -Name "zyron_role" -Draw { param($g, $brush, $pen) Draw-Crown $g $brush }
New-Icon -Name "zyron_owner" -Draw { param($g, $brush, $pen) Draw-Crown $g $brush }
New-Icon -Name "zyron_log" -Draw { param($g, $brush, $pen) Draw-Log $g $pen }
New-Icon -Name "zyron_log_alt" -Draw { param($g, $brush, $pen) Draw-Log $g $pen }
New-Icon -Name "zyron_link" -Draw { param($g, $brush, $pen) Draw-Link $g $pen }
New-Icon -Name "zyron_link_alt" -Draw { param($g, $brush, $pen) Draw-Link $g $pen }
New-Icon -Name "zyron_link_clip" -Draw { param($g, $brush, $pen) Draw-Link $g $pen }
New-Icon -Name "zyron_trash" -Draw { param($g, $brush, $pen) Draw-Trash $g $pen }
New-Icon -Name "zyron_alarm" -Draw { param($g, $brush, $pen) Draw-Bell $g $pen }
New-Icon -Name "zyron_server" -Draw { param($g, $brush, $pen) Draw-Server $g $pen }
New-Icon -Name "zyron_whitelist" -Draw { param($g, $brush, $pen) Draw-Shield $g $brush $pen $true }
New-Icon -Name "zyron_channel" -Draw { param($g, $brush, $pen) Draw-Channel $g $brush }
New-Icon -Name "zyron_box" -Draw { param($g, $brush, $pen) Draw-Box $g $brush $pen }
New-Icon -Name "zyron_box_alt" -Draw { param($g, $brush, $pen) Draw-Box $g $brush $pen }

# Community and economy
New-Icon -Name "zyron_crown" -Draw { param($g, $brush, $pen) Draw-Crown $g $brush }
New-Icon -Name "zyron_party" -Draw { param($g, $brush, $pen) Draw-Party $g $brush $pen }
New-Icon -Name "zyron_economy" -Draw { param($g, $brush, $pen) Draw-Chart $g $brush }
New-Icon -Name "zyron_coin" -Draw { param($g, $brush, $pen) Draw-Coin $g $brush $pen }
New-Icon -Name "zyron_ticket" -Draw { param($g, $brush, $pen) Draw-Ticket $g $pen }
New-Icon -Name "zyron_giveaway" -Draw { param($g, $brush, $pen) Draw-Box $g $brush $pen }
New-Icon -Name "zyron_poll" -Draw { param($g, $brush, $pen) Draw-Pie $g $brush $pen }
New-Icon -Name "zyron_invites" -Draw { param($g, $brush, $pen) Draw-UserPlus $g $brush $pen }
New-Icon -Name "zyron_id_card" -Draw { param($g, $brush, $pen) Draw-IdCard $g $brush $pen }
New-Icon -Name "zyron_help" -Draw { param($g, $brush, $pen) Draw-Help $g $brush }

# Bottom utility
New-Icon -Name "zyron_ledger" -Draw { param($g, $brush, $pen) Draw-Ledger $g $pen }
New-Icon -Name "zyron_back" -Draw { param($g, $brush, $pen) Draw-Shield $g $brush $pen $true }
New-Icon -Name "zyron_search" -Draw { param($g, $brush, $pen) Draw-Search $g $pen }
New-Icon -Name "zyron_clock" -Draw { param($g, $brush, $pen) Draw-Clock $g $brush $pen }
New-Icon -Name "zyron_calendar" -Draw { param($g, $brush, $pen) Draw-Calendar $g $pen }
New-Icon -Name "zyron_final_check" -Draw { param($g, $brush, $pen) Draw-Check $g $pen }
New-Icon -Name "zyron_final_cross" -Draw { param($g, $brush, $pen) Draw-Cross $g $pen }
New-Icon -Name "zyron_arrow" -Draw { param($g, $brush, $pen) Draw-Arrow $g $pen }
New-Icon -Name "zyron_loading" -Draw { param($g, $brush, $pen) Draw-Loading $g $brush }
New-Icon -Name "zyron_enabled" -Draw { param($g, $brush, $pen) Draw-Check $g $pen }
New-Icon -Name "zyron_emergency" -Draw { param($g, $brush, $pen) Draw-Bell $g $pen }
New-Icon -Name "zyron_raid" -Draw { param($g, $brush, $pen) Draw-Warning $g $brush $pen }
New-Icon -Name "zyron_nuke" -Draw { param($g, $brush, $pen) Draw-Radiation $g $brush $pen }
New-Icon -Name "zyron_profile" -Draw { param($g, $brush, $pen) Draw-IdCard $g $brush $pen }
New-Icon -Name "zyron_check" -Draw { param($g, $brush, $pen) Draw-Check $g $pen }
New-Icon -Name "zyron_cross" -Draw { param($g, $brush, $pen) Draw-Cross $g $pen }

# Existing extras used by the theme
New-Icon -Name "zyron_timestamp" -Draw { param($g, $brush, $pen) Draw-Clock $g $brush $pen }
New-Icon -Name "zyron_spark" -Draw { param($g, $brush, $pen) Draw-Star $g $brush }

Write-Host ""
Write-Host "Generated Zyron emoji set in $OutDir"
Write-Host "Next: node scripts/upload-emojis.js"
