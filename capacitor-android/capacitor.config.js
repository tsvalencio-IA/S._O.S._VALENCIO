/// <reference types="@capacitor/cli" />

/**
 * thIAguinho ERP — Android do S.O.S. Valêncio.
 * Carrega a publicação HTTPS de homologação para conteúdo web atualizado.
 * Mudanças nativas exigem novo APK; versões web dependem da publicação Pages.
 * Preserva os plugins e a identidade Android já existentes.
 * Powered by thIAguinho Soluções Digitais
 */
const config = {
  appId: 'br.com.thiaguinho.saas',
  appName: 'thIAguinho SaaS',
  webDir: 'www',
  bundledWebRuntime: false,
  // A interface e os scripts são carregados da própria publicação web de homologação.
  // Alterações web seguem o GitHub Pages; mudanças nativas exigem novo APK.
  server: {
    url: 'https://tsvalencio-ia.github.io/S._O.S._VALENCIO/selecionar-perfil.html?sos_app=android',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['tsvalencio-ia.github.io']
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0e1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#00D4FF'
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e1a'
    },
    Camera: {
      androidScaleType: 'CENTER_CROP',
      promptLabelHeader: 'Foto do veículo',
      promptLabelCancel: 'Cancelar',
      promptLabelPhoto: 'Da galeria',
      promptLabelPicture: 'Tirar foto'
    }
  }
};

module.exports = config;
