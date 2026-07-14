const DEFAULT_VISION_SERVICE_URL = 'http://localhost:8000';
const VISION_TIMEOUT_MS = 15000;

const getVisionServiceUrl = () =>
  (process.env.VISION_SERVICE_URL || DEFAULT_VISION_SERVICE_URL).replace(/\/$/, '');

const createTimeoutSignal = () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

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

    return payload;
  } finally {
    timeout.clear();
  }
};

module.exports = { detectContainerFromImage };
