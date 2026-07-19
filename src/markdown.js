const UNSAFE_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

function visibleControl(character) {
  return `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`;
}

export function markdownSafeText(value) {
  return String(value)
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(UNSAFE_CONTROL_CHARACTER, visibleControl);
}

export function markdownInline(value) {
  return markdownSafeText(value)
    .replace(/\n+/g, " ")
    .replace(/([\\`*_{}\[\]()<>#+.!|-])/g, "\\$1");
}

export function markdownDataBlock(value) {
  return markdownSafeText(value)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}
