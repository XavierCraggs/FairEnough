import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';

const isSupportedPlatform = Platform.OS === 'ios' || Platform.OS === 'android';

const getApiKey = () => {
  if (Platform.OS === 'ios') {
    return Constants.expoConfig?.extra?.revenueCatIosApiKey as string | undefined;
  }
  if (Platform.OS === 'android') {
    return Constants.expoConfig?.extra?.revenueCatAndroidApiKey as string | undefined;
  }
  return undefined;
};

const HOUSE_PASS_SKU =
  (Constants.expoConfig?.extra?.revenueCatHousePassSku as string | undefined) ||
  'house_pass_monthly';

type PremiumContext = {
  houseId: string;
  userId: string;
  userName?: string | null;
};

let configuredForHouse: string | null = null;
let isConfigured = false;

const ensureConfigured = async (houseId: string) => {
  if (!isSupportedPlatform) {
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('RevenueCat API key is missing.');
  }

  if (!isConfigured) {
    if (__DEV__) {
      Purchases.setLogLevel(Purchases.LOG_LEVEL.INFO);
    }
    Purchases.configure({ apiKey, appUserID: houseId });
    isConfigured = true;
    configuredForHouse = houseId;
    return;
  }

  if (configuredForHouse !== houseId) {
    await Purchases.logIn(houseId);
    configuredForHouse = houseId;
  }
};

const syncAttributes = async ({ houseId, userId, userName }: PremiumContext) => {
  await Purchases.setAttributes({
    houseId,
    purchaserUid: userId,
    purchaserName: userName ?? '',
  });
};

const premiumService = {
  housePassSku: HOUSE_PASS_SKU,

  async syncHouse(context: PremiumContext) {
    await ensureConfigured(context.houseId);
    await syncAttributes(context);
    return Purchases.getCustomerInfo();
  },

  async purchaseHousePass(context: PremiumContext) {
    if (!isSupportedPlatform) {
      throw new Error('Purchases are only supported on iOS and Android.');
    }

    await ensureConfigured(context.houseId);
    await syncAttributes(context);

    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) {
      throw new Error('No subscription offerings are available yet.');
    }

    const targetPackage = current.availablePackages.find(
      (pkg) => pkg.product.identifier === HOUSE_PASS_SKU
    );

    if (!targetPackage) {
      throw new Error(`House Pass SKU (${HOUSE_PASS_SKU}) is not available.`);
    }

    const { customerInfo } = await Purchases.purchasePackage(targetPackage);
    return customerInfo;
  },

  async restoreHousePass(context: PremiumContext) {
    if (!isSupportedPlatform) {
      throw new Error('Purchases are only supported on iOS and Android.');
    }

    await ensureConfigured(context.houseId);
    await syncAttributes(context);
    return Purchases.restorePurchases();
  },

  async openManageSubscriptions() {
    if (!isSupportedPlatform) {
      return;
    }

    await Purchases.showManageSubscriptions();
  },

  async reset() {
    if (!isSupportedPlatform || !isConfigured) {
      configuredForHouse = null;
      isConfigured = false;
      return;
    }

    try {
      await Purchases.logOut();
    } finally {
      configuredForHouse = null;
      isConfigured = false;
    }
  },
};

export default premiumService;
