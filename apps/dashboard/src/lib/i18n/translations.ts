/**
 * Translation registry.
 *
 * Strings live in `locales/<locale>/<namespace>.json` — one folder per
 * language, one file per page or area. A translator now edits one small file
 * instead of a 1,200-line module where every language is interleaved and merge
 * conflicts are guaranteed.
 *
 * Imports are written out rather than globbed on purpose: static imports are
 * what let the bundler tree-shake and the compiler check them, and a missing
 * file fails the build instead of silently shipping untranslated UI.
 *
 * ADDING A NAMESPACE: create `<name>.json` in EVERY locale folder, then add it
 * here. Missing KEYS fall back to English at lookup time (see index.tsx), so a
 * partial translation degrades gracefully; a missing FILE is a build error,
 * which is the right trade.
 */

import enCommon from "./locales/en/common.json";
import enProfile from "./locales/en/profile.json";
import enAdmin from "./locales/en/admin.json";
import enNotifications from "./locales/en/notifications.json";
import enSidebar from "./locales/en/sidebar.json";
import enAuth from "./locales/en/auth.json";
import enNav from "./locales/en/nav.json";
import enSearch from "./locales/en/search.json";
import enFooter from "./locales/en/footer.json";
import enComingSoon from "./locales/en/comingSoon.json";
import enCatalog from "./locales/en/catalog.json";
import enOrders from "./locales/en/orders.json";
import enFinance from "./locales/en/finance.json";
import enFulfillment from "./locales/en/fulfillment.json";
import enInventory from "./locales/en/inventory.json";
import enSupport from "./locales/en/support.json";
import enHome from "./locales/en/home.json";
import enWallet from "./locales/en/wallet.json";
import enAnalytics from "./locales/en/analytics.json";
import enSettings from "./locales/en/settings.json";
import enHelp from "./locales/en/help.json";
import enInvite from "./locales/en/invite.json";

import zhCommon from "./locales/zh/common.json";
import zhProfile from "./locales/zh/profile.json";
import zhAdmin from "./locales/zh/admin.json";
import zhNotifications from "./locales/zh/notifications.json";
import zhSidebar from "./locales/zh/sidebar.json";
import zhAuth from "./locales/zh/auth.json";
import zhNav from "./locales/zh/nav.json";
import zhSearch from "./locales/zh/search.json";
import zhFooter from "./locales/zh/footer.json";
import zhComingSoon from "./locales/zh/comingSoon.json";
import zhCatalog from "./locales/zh/catalog.json";
import zhOrders from "./locales/zh/orders.json";
import zhFinance from "./locales/zh/finance.json";
import zhFulfillment from "./locales/zh/fulfillment.json";
import zhInventory from "./locales/zh/inventory.json";
import zhSupport from "./locales/zh/support.json";
import zhHome from "./locales/zh/home.json";
import zhWallet from "./locales/zh/wallet.json";
import zhAnalytics from "./locales/zh/analytics.json";
import zhSettings from "./locales/zh/settings.json";
import zhHelp from "./locales/zh/help.json";
import zhInvite from "./locales/zh/invite.json";

import frCommon from "./locales/fr/common.json";
import frProfile from "./locales/fr/profile.json";
import frAdmin from "./locales/fr/admin.json";
import frNotifications from "./locales/fr/notifications.json";
import frSidebar from "./locales/fr/sidebar.json";
import frAuth from "./locales/fr/auth.json";
import frNav from "./locales/fr/nav.json";
import frSearch from "./locales/fr/search.json";
import frFooter from "./locales/fr/footer.json";
import frComingSoon from "./locales/fr/comingSoon.json";
import frCatalog from "./locales/fr/catalog.json";
import frOrders from "./locales/fr/orders.json";
import frFinance from "./locales/fr/finance.json";
import frFulfillment from "./locales/fr/fulfillment.json";
import frInventory from "./locales/fr/inventory.json";
import frSupport from "./locales/fr/support.json";
import frHome from "./locales/fr/home.json";
import frWallet from "./locales/fr/wallet.json";
import frAnalytics from "./locales/fr/analytics.json";
import frSettings from "./locales/fr/settings.json";
import frHelp from "./locales/fr/help.json";
import frInvite from "./locales/fr/invite.json";

import viCommon from "./locales/vi/common.json";
import viProfile from "./locales/vi/profile.json";
import viAdmin from "./locales/vi/admin.json";
import viNotifications from "./locales/vi/notifications.json";
import viSidebar from "./locales/vi/sidebar.json";
import viAuth from "./locales/vi/auth.json";
import viNav from "./locales/vi/nav.json";
import viSearch from "./locales/vi/search.json";
import viFooter from "./locales/vi/footer.json";
import viComingSoon from "./locales/vi/comingSoon.json";
import viCatalog from "./locales/vi/catalog.json";
import viOrders from "./locales/vi/orders.json";
import viFinance from "./locales/vi/finance.json";
import viFulfillment from "./locales/vi/fulfillment.json";
import viInventory from "./locales/vi/inventory.json";
import viSupport from "./locales/vi/support.json";
import viHome from "./locales/vi/home.json";
import viWallet from "./locales/vi/wallet.json";
import viAnalytics from "./locales/vi/analytics.json";
import viSettings from "./locales/vi/settings.json";
import viHelp from "./locales/vi/help.json";
import viInvite from "./locales/vi/invite.json";

import jaCommon from "./locales/ja/common.json";
import jaProfile from "./locales/ja/profile.json";
import jaAdmin from "./locales/ja/admin.json";
import jaNotifications from "./locales/ja/notifications.json";
import jaSidebar from "./locales/ja/sidebar.json";
import jaAuth from "./locales/ja/auth.json";
import jaNav from "./locales/ja/nav.json";
import jaSearch from "./locales/ja/search.json";
import jaFooter from "./locales/ja/footer.json";
import jaComingSoon from "./locales/ja/comingSoon.json";
import jaCatalog from "./locales/ja/catalog.json";
import jaOrders from "./locales/ja/orders.json";
import jaFinance from "./locales/ja/finance.json";
import jaFulfillment from "./locales/ja/fulfillment.json";
import jaInventory from "./locales/ja/inventory.json";
import jaSupport from "./locales/ja/support.json";
import jaHome from "./locales/ja/home.json";
import jaWallet from "./locales/ja/wallet.json";
import jaAnalytics from "./locales/ja/analytics.json";
import jaSettings from "./locales/ja/settings.json";
import jaHelp from "./locales/ja/help.json";
import jaInvite from "./locales/ja/invite.json";

import koCommon from "./locales/ko/common.json";
import koProfile from "./locales/ko/profile.json";
import koAdmin from "./locales/ko/admin.json";
import koNotifications from "./locales/ko/notifications.json";
import koSidebar from "./locales/ko/sidebar.json";
import koAuth from "./locales/ko/auth.json";
import koNav from "./locales/ko/nav.json";
import koSearch from "./locales/ko/search.json";
import koFooter from "./locales/ko/footer.json";
import koComingSoon from "./locales/ko/comingSoon.json";
import koCatalog from "./locales/ko/catalog.json";
import koOrders from "./locales/ko/orders.json";
import koFinance from "./locales/ko/finance.json";
import koFulfillment from "./locales/ko/fulfillment.json";
import koInventory from "./locales/ko/inventory.json";
import koSupport from "./locales/ko/support.json";
import koHome from "./locales/ko/home.json";
import koWallet from "./locales/ko/wallet.json";
import koAnalytics from "./locales/ko/analytics.json";
import koSettings from "./locales/ko/settings.json";
import koHelp from "./locales/ko/help.json";
import koInvite from "./locales/ko/invite.json";

import arCommon from "./locales/ar/common.json";
import arProfile from "./locales/ar/profile.json";
import arAdmin from "./locales/ar/admin.json";
import arNotifications from "./locales/ar/notifications.json";
import arSidebar from "./locales/ar/sidebar.json";
import arAuth from "./locales/ar/auth.json";
import arNav from "./locales/ar/nav.json";
import arSearch from "./locales/ar/search.json";
import arFooter from "./locales/ar/footer.json";
import arComingSoon from "./locales/ar/comingSoon.json";
import arCatalog from "./locales/ar/catalog.json";
import arOrders from "./locales/ar/orders.json";
import arFinance from "./locales/ar/finance.json";
import arFulfillment from "./locales/ar/fulfillment.json";
import arInventory from "./locales/ar/inventory.json";
import arSupport from "./locales/ar/support.json";
import arHome from "./locales/ar/home.json";
import arWallet from "./locales/ar/wallet.json";
import arAnalytics from "./locales/ar/analytics.json";
import arSettings from "./locales/ar/settings.json";
import arHelp from "./locales/ar/help.json";
import arInvite from "./locales/ar/invite.json";

export const translations = {
  en: {
    common: enCommon,
    profile: enProfile,
    admin: enAdmin,
    notifications: enNotifications,
    sidebar: enSidebar,
    auth: enAuth,
    nav: enNav,
    search: enSearch,
    footer: enFooter,
    comingSoon: enComingSoon,
    catalog: enCatalog,
    orders: enOrders,
    finance: enFinance,
    fulfillment: enFulfillment,
    inventory: enInventory,
    support: enSupport,
    home: enHome,
    wallet: enWallet,
    analytics: enAnalytics,
    settings: enSettings,
    help: enHelp,
    invite: enInvite,
  },
  zh: {
    common: zhCommon,
    profile: zhProfile,
    admin: zhAdmin,
    notifications: zhNotifications,
    sidebar: zhSidebar,
    auth: zhAuth,
    nav: zhNav,
    search: zhSearch,
    footer: zhFooter,
    comingSoon: zhComingSoon,
    catalog: zhCatalog,
    orders: zhOrders,
    finance: zhFinance,
    fulfillment: zhFulfillment,
    inventory: zhInventory,
    support: zhSupport,
    home: zhHome,
    wallet: zhWallet,
    analytics: zhAnalytics,
    settings: zhSettings,
    help: zhHelp,
    invite: zhInvite,
  },
  fr: {
    common: frCommon,
    profile: frProfile,
    admin: frAdmin,
    notifications: frNotifications,
    sidebar: frSidebar,
    auth: frAuth,
    nav: frNav,
    search: frSearch,
    footer: frFooter,
    comingSoon: frComingSoon,
    catalog: frCatalog,
    orders: frOrders,
    finance: frFinance,
    fulfillment: frFulfillment,
    inventory: frInventory,
    support: frSupport,
    home: frHome,
    wallet: frWallet,
    analytics: frAnalytics,
    settings: frSettings,
    help: frHelp,
    invite: frInvite,
  },
  vi: {
    common: viCommon,
    profile: viProfile,
    admin: viAdmin,
    notifications: viNotifications,
    sidebar: viSidebar,
    auth: viAuth,
    nav: viNav,
    search: viSearch,
    footer: viFooter,
    comingSoon: viComingSoon,
    catalog: viCatalog,
    orders: viOrders,
    finance: viFinance,
    fulfillment: viFulfillment,
    inventory: viInventory,
    support: viSupport,
    home: viHome,
    wallet: viWallet,
    analytics: viAnalytics,
    settings: viSettings,
    help: viHelp,
    invite: viInvite,
  },
  ja: {
    common: jaCommon,
    profile: jaProfile,
    admin: jaAdmin,
    notifications: jaNotifications,
    sidebar: jaSidebar,
    auth: jaAuth,
    nav: jaNav,
    search: jaSearch,
    footer: jaFooter,
    comingSoon: jaComingSoon,
    catalog: jaCatalog,
    orders: jaOrders,
    finance: jaFinance,
    fulfillment: jaFulfillment,
    inventory: jaInventory,
    support: jaSupport,
    home: jaHome,
    wallet: jaWallet,
    analytics: jaAnalytics,
    settings: jaSettings,
    help: jaHelp,
    invite: jaInvite,
  },
  ko: {
    common: koCommon,
    profile: koProfile,
    admin: koAdmin,
    notifications: koNotifications,
    sidebar: koSidebar,
    auth: koAuth,
    nav: koNav,
    search: koSearch,
    footer: koFooter,
    comingSoon: koComingSoon,
    catalog: koCatalog,
    orders: koOrders,
    finance: koFinance,
    fulfillment: koFulfillment,
    inventory: koInventory,
    support: koSupport,
    home: koHome,
    wallet: koWallet,
    analytics: koAnalytics,
    settings: koSettings,
    help: koHelp,
    invite: koInvite,
  },
  ar: {
    common: arCommon,
    profile: arProfile,
    admin: arAdmin,
    notifications: arNotifications,
    sidebar: arSidebar,
    auth: arAuth,
    nav: arNav,
    search: arSearch,
    footer: arFooter,
    comingSoon: arComingSoon,
    catalog: arCatalog,
    orders: arOrders,
    finance: arFinance,
    fulfillment: arFulfillment,
    inventory: arInventory,
    support: arSupport,
    home: arHome,
    wallet: arWallet,
    analytics: arAnalytics,
    settings: arSettings,
    help: arHelp,
    invite: arInvite,
  },
};
