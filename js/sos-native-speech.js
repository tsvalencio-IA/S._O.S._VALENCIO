/** S.O.S. VALÊNCIO — somente ditado nativo do Android. */
(function (W) {
  'use strict';
  function isNative() {
    try {
      const c = W.Capacitor;
      return !!(c && (
        (typeof c.isNativePlatform === 'function' && c.isNativePlatform()) ||
        (typeof c.getPlatform === 'function' && c.getPlatform() === 'android')
      ));
    } catch (_) { return false; }
  }
  function nativePlugin() {
    if (!isNative()) return null;
    const c = W.Capacitor;
    return c?.Plugins?.SosSpeechInput ||
      (typeof c?.registerPlugin === 'function' ? c.registerPlugin('SosSpeechInput') : null);
  }
  async function listen() {
    const plugin = nativePlugin();
    if (!plugin || typeof plugin.listen !== 'function') {
      throw new Error('Ponte de voz Android indisponível: é necessário instalar o novo APK.');
    }
    const value = await plugin.listen();
    return String(value?.text || '').trim();
  }
  function insert(field, phrase) {
    if (!field || !phrase) return;
    const str = String(field.value || '');
    const canSelect = typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number';
    const start = canSelect ? field.selectionStart : str.length;
    const end = canSelect ? field.selectionEnd : str.length;
    const left = str.slice(0, start);
    const right = str.slice(end);
    const sepBefore = left && !/[\s\n]$/.test(left) ? ' ' : '';
    const sepAfter = right && !/^[\s\n.,;:!?]/.test(right) ? ' ' : '';
    field.value = left + sepBefore + phrase + sepAfter + right;
    const caret = (left + sepBefore + phrase).length;
    try { field.setSelectionRange(caret, caret); } catch (_) {}
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  W.sosNativeSpeech = { available: isNative, listen, insert };
})(window);
