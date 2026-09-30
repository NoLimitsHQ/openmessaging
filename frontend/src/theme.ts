export const themes = {
  dark: {
    primary: "#128C7E", // WhatsApp yeşili
    bgMain: "#0b0c0d",
    bgSidebar: "#111b21",
    bgPanel: "#111b21",
    bgHeader: "#1f2c33",
    bgInput: "#2a3942",
    bgBubbleOutgoing: "#005c4b",
    bgBubbleIncoming: "#111b21",
    bgContactActive: "#1f2c33",
    bcgUserTag: "#005c4b",
    textPrimary: "#e9edef",
    textSecondary: "#8696a0",
    textMuted: "#667781",
    borderColor: "#2a3942",
    dividerColor: "#2a3942",
  },
  light: {
    primary: "#075e54",
    bgMain: "#efeae2",
    bgSidebar: "#d1c9b5",
    bgPanel: "#ffffff",
    bgHeader: "#f0f0f0",
    bgInput: "#f0f0f0",
    bgBubbleOutgoing: "#d9fdd3",
    bgBubbleIncoming: "#ffffff",
    bgContactActive: "#dcd4c5",
    bcgUserTag: "#d9fdd3",
    textPrimary: "#111b21",
    textSecondary: "#667781",
    textMuted: "#8696a0",
    borderColor: "#e9edef",
    dividerColor: "#e9edef",
  },
} as const;

export type Theme = keyof typeof themes;
export const defaultTheme: Theme = "dark";
