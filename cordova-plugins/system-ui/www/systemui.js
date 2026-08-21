/*
 * SystemUI Cordova plugin (com.rn0x.systemui) — JS bridge.
 * Syncs the Android status bar + navigation bar colors and icon
 * appearance (light/dark) with the app's theme, with per-bar control.
 *
 * Examples:
 *   // Apply one color + auto icons to both bars:
 *   cordova.plugins.SystemUI.style({ barColor: '#0a1428', isLight: false })
 *
 *   // Full per-bar control:
 *   cordova.plugins.SystemUI.style({
 *     statusBarColor: '#101f3c',
 *     navBarColor: '#0a1428',
 *     statusBarIcons: 'light',
 *     navBarIcons: 'dark',
 *   })
 */
var exec = require('cordova/exec')

var DEFAULT_COLOR = '#0a1428'

function parseColor(hex, fallback) {
  if (typeof hex !== 'string') return fallback
  var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(hex.trim())
  return m ? hex.trim() : fallback
}

/**
 * Decides whether the icons should be dark (light icon appearance) for a
 * given background color. An explicit `isLight` shortcut wins; otherwise the
 * background luminance decides (light bg → dark icons).
 */
function inferDarkIcons(color, isLight) {
  if (typeof isLight === 'boolean') return isLight
  var h = color.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  var r = parseInt(h.slice(0, 2), 16)
  var g = parseInt(h.slice(2, 4), 16)
  var b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
}

/**
 * Resolves a per-bar icon option:
 *   opts.<bar>Icons  'light' | 'dark'   explicit choice
 *   opts.isLight     Boolean            shortcut for both bars
 *   otherwise                            auto from the resolved color
 */
function resolveDarkIcons(explicit, color, isLight) {
  if (explicit === 'dark') return true
  if (explicit === 'light') return false
  return inferDarkIcons(color, isLight)
}

var SystemUI = {
  /**
   * opts:
   *   barColor        String   (#rrggbb/#aarrggbb) background for BOTH bars. (shortcut)
   *   isLight         Boolean  true → light background for both (dark icons). (shortcut)
   *   statusBarColor  String   background of the status bar only.
   *   navBarColor     String   background of the navigation bar only.
   *   statusBarIcons  'light' | 'dark'   icon color of the status bar.
   *   navBarIcons     'light' | 'dark'   icon color of the navigation bar.
   */
  style: function (opts) {
    opts = opts || {}
    var barColor = parseColor(opts.barColor, DEFAULT_COLOR)
    var statusColor = parseColor(opts.statusBarColor, barColor)
    var navColor = parseColor(opts.navBarColor, barColor)

    var statusDarkIcons = resolveDarkIcons(opts.statusBarIcons, statusColor, opts.isLight)
    var navDarkIcons = resolveDarkIcons(opts.navBarIcons, navColor, opts.isLight)

    return new Promise(function (resolve, reject) {
      exec(resolve, reject, 'SystemUI', 'style', [{
        statusBarColor: statusColor,
        statusBarDarkIcons: statusDarkIcons,
        navBarColor: navColor,
        navBarDarkIcons: navDarkIcons,
      }])
    })
  },
}

module.exports = SystemUI