const DEFAULT_VISION_SERVICE_URL = 'http://localhost:8000';
// Le premier appel peut charger YOLO et PaddleOCR : il est plus long que les suivants.
const DEFAULT_VISION_TIMEOUT_MS = 180000;

const getVisionServiceUrl = () =>
  (process.env.VISION_SERVICE_URL || DEFAULT_VISION_SERVICE_URL).replace(/\/$/, '');

const getVisionTimeoutMs = () => {
  const configuredTimeout = Number(process.env.VISION_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_VISION_TIMEOUT_MS;
};

const createTimeoutSignal = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getVisionTimeoutMs());

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
};

const detectContainerFromImage = async (file) => {
  if (!file?.buffer) {
    const error = new Error('Une image du conteneur est obligatoire.');
    error.statusCode = 400;
    throw error;
  }

  const formData = new FormData();
  const imageBlob = new Blob([file.buffer], {
    type: file.mimetype || 'application/octet-stream',
  });
  formData.append('image', imageBlob, file.originalname || 'container-image');

  const timeout = createTimeoutSignal();

  try {
    const response = await fetch(`${getVisionServiceUrl()}/detect-container`, {
      method: 'POST',
      body: formData,
      signal: timeout.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(
        payload?.message || 'Le service Vision IA a retourne une erreur.',
      );
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }

    if (!payload || typeof payload !== 'object') {
      const error = new Error('Reponse invalide du service Vision IA.');
      error.statusCode = 502;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Le service Vision IA a depasse le delai autorise.');
      timeoutError.statusCode = 504;
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    timeout.clear();
  }
};

module.exports = { detectContainerFromImage };
