#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
SCHEMA_DIR="$ROOT_DIR/.tauri-gschemas"
mkdir -p "$SCHEMA_DIR"

# Ubuntu 26 ships the legacy font keys in a deprecated schema while one of the
# GTK modules still asks for them on the current schema id. Keep this workaround
# local to the development process; it never changes /usr/share schemas.
cat > "$SCHEMA_DIR/org.gnome.settings-daemon.plugins.xsettings.gschema.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <enum id="org.gnome.settings-daemon.GsdFontAntialiasingMode"><value nick="none" value="0"/><value nick="grayscale" value="1"/><value nick="rgba" value="2"/></enum>
  <enum id="org.gnome.settings-daemon.GsdFontHinting"><value nick="none" value="0"/><value nick="slight" value="1"/><value nick="medium" value="2"/><value nick="full" value="3"/></enum>
  <enum id="org.gnome.settings-daemon.GsdFontRgbaOrder"><value nick="rgba" value="0"/><value nick="rgb" value="1"/><value nick="bgr" value="2"/><value nick="vrgb" value="3"/><value nick="vbgr" value="4"/></enum>
  <schema id="org.gnome.settings-daemon.plugins.xsettings" path="/org/gnome/settings-daemon/plugins/xsettings/">
    <key name="disabled-gtk-modules" type="as"><default>[]</default></key>
    <key name="enabled-gtk-modules" type="as"><default>[]</default></key>
    <key name="overrides" type="a{sv}"><default>{}</default></key>
    <key name="antialiasing" enum="org.gnome.settings-daemon.GsdFontAntialiasingMode"><default>'grayscale'</default></key>
    <key name="hinting" enum="org.gnome.settings-daemon.GsdFontHinting"><default>'slight'</default></key>
    <key name="rgba-order" enum="org.gnome.settings-daemon.GsdFontRgbaOrder"><default>'rgb'</default></key>
  </schema>
</schemalist>
EOF
glib-compile-schemas "$SCHEMA_DIR"

export GTK_MODULES=
export GSETTINGS_BACKEND=memory
export GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR"
export XDG_CURRENT_DESKTOP=Unity
TAURI_PATH="$HOME/.cargo/bin:$ROOT_DIR/node_modules/.bin:$HOME/.nvm/versions/node/v24.14.1/bin:/usr/local/bin:/usr/bin:/bin"
exec env -i \
  HOME="$HOME" USER="${USER:-}" \
  PATH="$TAURI_PATH" PWD="$ROOT_DIR" \
  DISPLAY="${DISPLAY:-}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" \
  XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}" \
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}" \
  XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}" \
  XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}" \
  DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}" \
  LANG="${LANG:-C.UTF-8}" LC_ALL="${LC_ALL:-}" TERM="${TERM:-xterm-256color}" \
  GTK_MODULES= GSETTINGS_BACKEND=memory GSETTINGS_SCHEMA_DIR="$SCHEMA_DIR" \
  XDG_CURRENT_DESKTOP=Unity GDK_BACKEND=x11 \
  "$ROOT_DIR/node_modules/.bin/tauri" "$@"
