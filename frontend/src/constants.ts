export const AVATARS = [
  { id: "alan", name: "Alan" },
  { id: "ada",  name: "Ada"  },
];

export const LANGS = [
  { id: "en", name: "English"  },
  { id: "fr", name: "French"   },
  { id: "ja", name: "Japanese" },
  { id: "zh", name: "Chinese"  },
  { id: "ru", name: "Russian"  },
  { id: "ar", name: "Arabic"   },
];

export const LANG_TO_LONG: Record<string, string> = { en: "english", fr: "french", ar: "arabic", ja: "japanese", zh: "chinese", ru: "russian" };
export const LONG_TO_LANG: Record<string, string> = { english: "en", french: "fr", arabic: "ar", japanese: "ja", chinese: "zh", russian: "ru" };

export const UI_STRINGS: Record<string, {
  welcome: string;
  startPresentation: (name: string) => string;
  resuming: string;
  switchingChat: string;
  error: string;
}> = {
  en: {
    welcome: "Hello! I'm your HORIBA assistant. How can I help you?",
    startPresentation: (name) => `Starting presentation: "${name}"`,
    resuming: "Resuming presentation...",
    switchingChat: "Switching to chat mode.",
    error: "Sorry, I encountered an error. Please try again.",
  },
  fr: {
    welcome: "Bonjour\u00a0! Je suis votre assistant HORIBA. Comment puis-je vous aider\u00a0?",
    startPresentation: (name) => `Démarrage de la présentation\u00a0: «\u00a0${name}\u00a0»`,
    resuming: "Reprise de la présentation...",
    switchingChat: "Passage en mode discussion.",
    error: "Désolé, une erreur s'est produite. Veuillez réessayer.",
  },
  ar: {
    welcome: "مرحباً! أنا مساعدك في HORIBA. كيف يمكنني مساعدتك؟",
    startPresentation: (name) => `بدء العرض التقديمي: "${name}"`,
    resuming: "استئناف العرض التقديمي...",
    switchingChat: "التبديل إلى وضع المحادثة.",
    error: "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.",
  },
  ja: {
    welcome: "こんにちは！HORIBAのアシスタントです。どのようにお手伝いできますか？",
    startPresentation: (name) => `プレゼンテーションを開始します：「${name}」`,
    resuming: "プレゼンテーションを再開します...",
    switchingChat: "チャットモードに切り替えます。",
    error: "エラーが発生しました。もう一度お試しください。",
  },
  zh: {
    welcome: "您好！我是您的HORIBA助手。有什么可以帮助您的吗？",
    startPresentation: (name) => `开始演示："${name}"`,
    resuming: "继续演示...",
    switchingChat: "切换到聊天模式。",
    error: "抱歉，发生了错误。请再试一次。",
  },
  ru: {
    welcome: "Здравствуйте! Я ваш ассистент HORIBA. Чем могу помочь?",
    startPresentation: (name) => `Начинаю презентацию: «${name}»`,
    resuming: "Возобновляю презентацию...",
    switchingChat: "Переключаюсь в режим чата.",
    error: "Извините, произошла ошибка. Пожалуйста, попробуйте ещё раз.",
  },
};

export const ADMIN_EMAILS  = ["alexandre.grigoriev@gmail.com", "alexandre.grigoriev@horiba.com"];
export const TRUSTED_USERS: string[] = [];
