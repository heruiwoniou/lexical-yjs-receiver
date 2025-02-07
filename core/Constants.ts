export const baseIncludedProperties = new Set<string>([]);
export const baseExcludedProperties = new Set<string>([]);


export const IS_BOLD = 1;
export const IS_ITALIC = 1 << 1;
export const IS_STRIKETHROUGH = 1 << 2;
export const IS_UNDERLINE = 1 << 3;
export const IS_CODE = 1 << 4;
export const IS_SUBSCRIPT = 1 << 5;
export const IS_SUPERSCRIPT = 1 << 6;
export const IS_HIGHLIGHT = 1 << 7;
export const IS_LOWERCASE = 1 << 8;
export const IS_UPPERCASE = 1 << 9;
export const IS_CAPITALIZE = 1 << 10;

export const IS_ALL_FORMATTING =
  IS_BOLD |
  IS_ITALIC |
  IS_STRIKETHROUGH |
  IS_UNDERLINE |
  IS_CODE |
  IS_SUBSCRIPT |
  IS_SUPERSCRIPT |
  IS_HIGHLIGHT |
  IS_LOWERCASE |
  IS_UPPERCASE |
  IS_CAPITALIZE;
