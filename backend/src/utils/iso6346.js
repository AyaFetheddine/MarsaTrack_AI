const LETTER_VALUES = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
};

const CONTAINER_CODE_FORMAT = /^[A-Z]{4}[0-9]{7}$/;
const CODE_WITHOUT_CHECK_DIGIT_FORMAT = /^[A-Z]{4}[0-9]{6}$/;

const normalizeContainerCode = (code) => {
  if (typeof code !== 'string') return '';

  return code.replace(/[\s-]/g, '').toUpperCase();
};

const parseContainerCode = (code) => {
  const normalized = normalizeContainerCode(code);

  if (!CONTAINER_CODE_FORMAT.test(normalized)) {
    return {
      normalized,
      isValidFormat: false,
    };
  }

  return {
    normalized,
    isValidFormat: true,
    ownerCode: normalized.slice(0, 3),
    category: normalized.slice(3, 4),
    serialNumber: normalized.slice(4, 10),
    checkDigit: normalized.slice(10, 11),
  };
};

const getCharacterValue = (character) => {
  if (/^\d$/.test(character)) {
    return Number(character);
  }

  return LETTER_VALUES[character];
};

const calculateCheckDigit = (codeWithoutCheckDigit) => {
  const normalized = normalizeContainerCode(codeWithoutCheckDigit);

  if (!CODE_WITHOUT_CHECK_DIGIT_FORMAT.test(normalized)) {
    return null;
  }

  const total = normalized
    .split('')
    .reduce((sum, character, index) => {
      const value = getCharacterValue(character);
      return sum + value * 2 ** index;
    }, 0);

  const remainder = total % 11;
  return String(remainder === 10 ? 0 : remainder);
};

const validateContainerCode = (code) => {
  const parsed = parseContainerCode(code);

  if (!parsed.isValidFormat) {
    return {
      normalized: parsed.normalized,
      isValidFormat: false,
      isValidCheckDigit: false,
      isValid: false,
      message: 'Format ISO 6346 invalide.',
    };
  }

  const expectedCheckDigit = calculateCheckDigit(parsed.normalized.slice(0, 10));
  const isValidCheckDigit = parsed.checkDigit === expectedCheckDigit;

  return {
    ...parsed,
    isValidCheckDigit,
    isValid: isValidCheckDigit,
    expectedCheckDigit,
    message: isValidCheckDigit
      ? 'Code ISO 6346 valide.'
      : 'Chiffre de controle ISO 6346 invalide.',
  };
};

module.exports = {
  normalizeContainerCode,
  parseContainerCode,
  calculateCheckDigit,
  validateContainerCode,
};
