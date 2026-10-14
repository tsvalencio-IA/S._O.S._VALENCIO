#!/usr/bin/env bash
# Preparação nativa do S.O.S. Valêncio — somente build de homologação.
# Mantém o plugin ELM Bluetooth clássico e permissões do Android original.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_ROOT="$ROOT/capacitor-android"
MAIN="$ANDROID_ROOT/android/app/src/main"
OVERRIDES="$ANDROID_ROOT/android-overrides"
JAVA_TARGET="$MAIN/java/br/com/thiaguinho/saas"

test -f "$ANDROID_ROOT/android/gradlew" || { echo "Android Capacitor não foi gerado."; exit 1; }
test -f "$OVERRIDES/MainActivity.java"
test -f "$OVERRIDES/ELMBluetoothClassicPlugin.java"
test -f "$OVERRIDES/SosSpeechInputPlugin.java"
test -f "$OVERRIDES/AndroidManifest.xml"
test -f "$OVERRIDES/res/xml/file_paths.xml"

mkdir -p "$JAVA_TARGET" "$MAIN/res/xml"
# Corrige somente a declaração de pacote dos overrides (o appId original é preservado).
sed 's/^package br\.com\.thiaguinho\.cliente;/package br.com.thiaguinho.saas;/' \
  "$OVERRIDES/MainActivity.java" > "$JAVA_TARGET/MainActivity.java"
sed 's/^package br\.com\.thiaguinho\.cliente;/package br.com.thiaguinho.saas;/' \
  "$OVERRIDES/ELMBluetoothClassicPlugin.java" > "$JAVA_TARGET/ELMBluetoothClassicPlugin.java"
sed 's/^package br\.com\.thiaguinho\.cliente;/package br.com.thiaguinho.saas;/' \
  "$OVERRIDES/SosSpeechInputPlugin.java" > "$JAVA_TARGET/SosSpeechInputPlugin.java"

# Preserva as permissões e integrações nativas da configuração Android já existente.
cp "$OVERRIDES/AndroidManifest.xml" "$MAIN/AndroidManifest.xml"
cp "$OVERRIDES/res/xml/file_paths.xml" "$MAIN/res/xml/file_paths.xml"
# Mantém os recursos de ícones existentes até aprovação explícita do novo desenho.
if [ -f "$OVERRIDES/strings.xml" ]; then
  sed 's/br\.com\.thiaguinho\.cliente/br.com.thiaguinho.saas/g' \
    "$OVERRIDES/strings.xml" > "$MAIN/res/values/strings.xml"
fi

grep -q 'registerPlugin(ELMBluetoothClassicPlugin.class)' "$JAVA_TARGET/MainActivity.java"
grep -q 'registerPlugin(SosSpeechInputPlugin.class)' "$JAVA_TARGET/MainActivity.java"
grep -q 'android.permission.BLUETOOTH_CONNECT' "$MAIN/AndroidManifest.xml"
grep -q 'android.permission.CAMERA' "$MAIN/AndroidManifest.xml"
grep -q 'android.permission.RECORD_AUDIO' "$MAIN/AndroidManifest.xml"
echo 'Validada configuração nativa, Bluetooth, câmera, áudio e FileProvider.'
