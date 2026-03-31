/**
 * Known fraud domains extracted from the Combined_Fraud_Dataset_With_Source.xlsx
 * containing 293,715 records (4,124 fraud messages with 3,095 URLs).
 * Only domains appearing 2+ times in fraud messages are included.
 * Source types: phishing (3,007), SMS fraud (642), credit card fraud (473).
 *
 * Generated on: 2026-03-05
 */

export const KNOWN_FRAUD_DOMAINS = new Set([
    // PayPal phishing imposters
    'paypal-support.com.desenvolvedortheosbank.com.br',
    'paypal.com-cgi-bin.webscr.cmd-secure-login.webscr.cmd-home.country-lang.true-cmd.areuhj.dstech.us.com',
    'paypal.com-updates-account--verification.enterprisesion.com',
    'paypal.com.login.prosto-vsem.ru',
    'paypal.kenkenuae.com',
    'paysecures.cc',
    'payinfom.cc',
    'payline.buzz',
    'payitbehindyou.com',
    'payksupay.nydfay.top',
    'paylahbank.life',
    'payasosmiami.com',

    // Apple ID phishing
    'apple-idevice.gq',
    'apple-us.info',
    'apple.com-srk.asia',
    'apple.com-srt.cloud',
    'apple.localization-my.info',
    'appleid-find.cloud',
    'appleid-web.info',
    'appleid.ibnsinashipping.com',
    'applesoporte.com.pe',
    'authorise-id-apple.firebaseapp.com',
    'authorise-id-apple.web.app',
    'instagram-apple.com',
    'soporteapple-com.wl1.top',
    'support-apple.ss-c.us',

    // Amazon phishing
    'amazon-ert.dumb1.com',
    'amazon-ivabsdgfb.longmusic.com',
    'amazon-kutyttt.mefound.com',
    'amazon-nnmbnv.mrbonus.com',
    'amazon.co.jp.chenbbb.xyz',
    'amazon.co.jp.rozbek.ltd',
    'amazon.diaoke999.cn',
    'amazon5551.com',
    'amazonotp.com',

    // Banking / FinTech phishing
    'wellsfargo.tronxpay.com',
    'aws-wellsfarg2.s3.eu-west-2.amazonaws.com',
    'review-santander-payees.com',
    'sa.www4.irs.gov',
    'sbi.mx',
    'drect-smtb.jp.ap1.ib.shopperada.com',

    // Shopee / marketplace phishing
    'shopeevte.com',
    'shopeevxs.com',
    'shopeevxs.live',
    'shopeevxs.top',
    'shopeinnovationt.com',
    'shopfreefireuytin.com',
    'shopwebstudio.com',
    'shopyouhere.com',
    'facebook-marketplace-item2462699.web.app',
    'marketplace-item.comtransur-ard.com',
    'marketplace.item32532213213512313325.contassece.com.br',
    'carousell-caroupay-paynow.web.app',
    'ebay-de.checks-pays-online.org',

    // Crypto / wallet phishing
    'metamask-restorer.netlify.app',
    'walletconnect-pay.com',
    'webmainnetrestore.com',
    'goodkarmapay.com',

    // SMS / subscription scams
    'lps.onevoda.com',
    'lps.real-moon-services.com',
    'sms.ac',
    'smsco.net',
    'textcomp.com',
    'textpod.net',
    'comuk.net',
    'getzed.co.uk',
    'ringtones.co.uk',
    'txttowin.co.uk',
    'urawinner.com',
    'movietrivia.tv',

    // Fake reward / lottery sites
    'romaslotcreditfree.com',
    'cluberesgatedepontos.com',
    'novoitaufatura.com',
    'novaconsultamagalu.com',
    'janeirosubofertas.com',
    'descontodalu2023.com',
    'semprecomalu.com',
    'luizaacesso.com',
    'luizaatendimento.com',
    'faturaatualizadaline.com',
    'faturaonline-credi-card.store',
    'hipercardconsultafacil.com',
    'magacadastro.com',

    // Fake shops / e-commerce scams
    'oficial-site-online.myshopify.com',
    'semana-do-consumidor-23-03-2023.myshopify.com',
    'shop-brasil-online-2023.myshopify.com',
    'blurbshop.com',
    'onesupershop.com',
    'usashopinformed.com',
    'nimbeshop.com',
    'lushop.lpt.co.th',
    'mrbeanstore.com',
    'credofast-deal.elementor.cloud',
    'sp-repackproduct.com',

    // Suspicious domains (high-frequency in fraud)
    'nexkraft.com',
    'atpproduct.com',
    'new-order.me',
    'newhopedubai.ae',
    'esautodealer.com',
    'leads.imagineautos.com',
    'cartomanziatrigono3.it',
    'cpanel10wh.bkk1.cloud.z.com',
    'allmediks.com',
    'alphadealsmarketing.com',
    'aneesakhtar.com',
    'baconworkshop.com',
    'fastcart.co.za',
    'figurinebay.com',
    'gspilots.com',
    'indusmin.com',
    'jsacms.in',
    'learnenglishwithmarnus.com',
    'moderndps.org',
    'online24support-destore.com',
    'orderedami.com',
    'photopayz.com',
    'protechnodeals.com',
    'samsatbali.com',
    'tando.tn',
    'thaipaiboon.com',
    'theglassonionsociety.com',
    'tvasiatelugu.com',
    'ezssausage.com',
    'fadeologybarbersshops.com',
    'jennajewelsluxuryhair.com',
    'atozdeals.co',
    'euro-techproducts.com.au',

    // IP-based phishing
    '34.205.17.128',
    '49.51.43.12',

    // Suspicious shops
    'shoesjordan.shop',
    'tipsotrick.shop',
    'vinno.shop',
    'vopeng.shop',
    'oengp.shop',
    'olligaffrending.shop',
    'q8pda.shop',
    'kamtex.shop',
    'kdubfh.shop',
    'zaiyin.shop',
    '81kw81.myspreadshop.fr',

    // Misc phishing campaigns
    'account-billing.emmausadventures.com',
    'accounts.mail.wesfrgpay.com',
    'app-webmailarl56hykr0ul4ufic4vrjw.contato.store',
    'arbi-pay.com',
    'areadocliente.paginas.store',
    'attloginpagesitemap111.square.site',
    'cheaphostingph.com',
    'claim-order034921931.mysmarthr.co.zw',
    'click.pstmrk.it',
    'configure-checkout.mefound.com',
    'cookies-pay.com',
    'daiichi-gakki.co.jp',
    'dutsh-helppackage.ecranul.ro',
    'ecompaydays.com',
    'evdenevetasimacilik.biz.tr',
    'express-paymentf9b625ed.viakeralatravels.com',
    'flw-deltrk.findmytoporders.com',
    'govuk-payroll.web.app',
    'ldew.com',
    'mail.deliverylifesupport.com',
    'mistoreosqc-jp.top',
    'mistoreosqv-jp.top',
    'myfik.unisza.edu.my',
    'pagostuyapay.hostfree.pw',
    'pakunek-allegro.e-kei.pl',
    'pay0lx-delivery.7566890.xyz',
    'pinnatiped-targets.000webhostapp.com',
    'prestashop-115950-0.cloudclusters.net',
    'purchaseorderdocuments.instanthq.com',
    'realizesolucoesfinanceiraas.ubpages.com',
    'restore-page.weeblysite.com',
    'restore-pagech.weeblysite.com',
    'restorepoint-107793.weeblysite.com',
    'rift-dramatic-target.glitch.me',
    'shopfreefireuytin.com',
    'siwiss-com-iki.pya.jp',
    'spotify-billing.glw.com.au',
    'srkacha.duckdns.org',
    'tdapelsin.ru',
    'templeaudiotour.cdigproductions.com',
    'tudoparasuaviagem.com',
    'viacredi.netsys.mom',
    'wwwinfoaupay.speaciossp.com',
    'ww2.etc-meisai.jp.1amazonas.life',
    'alymov.dealer.yamaha-dws.ru',
    '200344652189.kumpulbarengteman.my.id',
    '862221.selcdn.ru',
    'descartes-dot-exceldocsverification.uk.r.appspot.com',
    'ovh.com',
    'apply.aui.ma',
    'e-tlp.co.uk',
    '4-tc.biz',
])

/**
 * Fraud message keyword patterns — the most common words found in
 * fraud SMS/phishing messages, sorted by frequency in the dataset.
 * Used for scoring suspicious messages and link content.
 */
export const FRAUD_MESSAGE_KEYWORDS = [
    // High frequency (50+)
    'free', 'login', 'account', 'claim', 'payment', 'support', 'prize',
    'update', 'bank', 'won', 'urgent',
    // Medium frequency (10–49)
    'offer', 'expire', 'gift', 'selected', 'winner', 'bonus', 'verify',
    'discount', 'reward', 'congratulations', 'password', 'lucky',
    // Lower frequency but high-signal
    'otp', 'alert', 'refund', 'confirm', 'upi', 'suspend', 'helpdesk',
    'block', 'kyc', 'cashback', 'click here', 'act now', 'limited time',
    'immediate action', 'dear customer', 'unauthorized', 'suspicious activity',
]

/** Dataset summary for reference:
 *  - 293,715 total records
 *  - 4,124 fraud (1.4%), 289,591 legitimate
 *  - Sources: phishing (3,007), SMS spam (642), credit card fraud (473)
 *  - 3,095 URLs extracted from fraud messages → 2,578 unique domains
 */
