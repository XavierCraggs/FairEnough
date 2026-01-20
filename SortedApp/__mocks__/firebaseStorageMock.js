const getStorage = () => ({});

const ref = (_storage, path) => ({ path });

const uploadBytes = async () => ({ metadata: {} });

const getDownloadURL = async () => 'https://example.com/profile.jpg';

module.exports = {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
};
