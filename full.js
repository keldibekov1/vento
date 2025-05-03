const TelegramBot = require("node-telegram-bot-api");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const creds = require("./google-credentials.json"); // Google Sheets xizmatining JSON kaliti

const token = "7897153787:AAEqWoQCiP7z-koNuK7QOSIqNh7caZAXV_w"; // Telegram bot tokeni
const bot = new TelegramBot(token, { polling: true });

const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = ""; // Google Sheets ID
const userLanguages = {}; // Foydalanuvchi tillarini saqlash uchun obyekt

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sendLanguageSelection(chatId);
});

// Til tanlash menyusini chiqarish funksiyasi
function sendLanguageSelection(chatId) {
  bot.sendMessage(chatId, "Tilni tanlang | Выберите язык", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇺🇿 Uzbekcha", callback_data: "lang_uz" },
          { text: "🇷🇺 Русский", callback_data: "lang_ru" },
        ],
      ],
    },
  });
}

// Til tanlash handleri
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "lang_uz") {
    userLanguages[chatId] = "uz";
    sendMainMenu(chatId, "uz");
  } else if (data === "lang_ru") {
    userLanguages[chatId] = "ru";
    sendMainMenu(chatId, "ru");
  }
});

// Asosiy menyuni chiqarish funksiyasi
function sendMainMenu(chatId, lang) {
  let message =
    lang === "uz"
      ? "Xush kelibsiz! Vento stone onlayn yordamchi tayyor!"
      : "Добро пожаловать! Онлайн-помощник Vento stone готов!";

  let keyboard =
    lang === "uz"
      ? [
          [{ text: "Mahsulotni izlash" }, { text: "Sotuvdagi toshlar" }],
          [{ text: "Katalog" }, { text: "Tosh bo'laklari" }],
          [{ text: "Brendlar" }, { text: "Ijtimoiy tarmoqlar" }],
          [{ text: "Tilni o‘zgartirish 🇺🇿 | 🇷🇺" }],
        ]
      : [
          [{ text: "Поиск товара" }, { text: "Камни в продажи" }],
          [{ text: "Каталог" }, { text: "Куски камня" }],
          [{ text: "Бренды" }, { text: "Социальные сети" }],
          [{ text: "Изменить язык 🇷🇺 | 🇺🇿" }],
        ];

  bot.sendMessage(chatId, message, {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
    },
  });
}

// Foydalanuvchi tilni o‘zgartirish tugmachasini bosganda
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (
    text === "Tilni o‘zgartirish 🇺🇿 | 🇷🇺" ||
    text === "Изменить язык 🇷🇺 | 🇺🇿"
  ) {
    sendLanguageSelection(chatId);
  }
});

// Markdown belgilarini eskaplash funksiyasi
function escapeMarkdown(text) {
  return text.replace(/([_*[\]()~`>#+=|{}.!])/g, (match) => {
    return match === "!" ? match : `\\${match}`;
  });
}

// Kategoriyalarni yuklash funksiyasi
async function getCategories() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sotuvdagi_toshlar!A2:A",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];
  return [...new Set(rows.flat())]; // Noyob kategoriyalar
}

// Mahsulotlarni yuklash funksiyasi
async function getProducts(category) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sotuvdagi_toshlar!A2:F",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const filteredProducts = rows
    .filter((row) => row[0] === category)
    .map((row) => ({
      model: row[1]?.trim(),
      price: row[2]?.trim(),
      quantity: row[3]?.trim(),
      imageUrls: row[4] ? row[4].split(",").map((url) => url.trim()) : [],
    }));

  return filteredProducts;
}

// `/sale` komandasi uchun handler
bot.onText(/Sotuvdagi toshlar|Камни в продажи/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = userLanguages[chatId] || "uz";
  const categories = await getCategories();
  if (categories.length === 0) {
    bot.sendMessage(
      chatId,
      lang === "uz"
        ? "📌 Hech qanday mahsulot topilmadi."
        : "📌 Товары не найдены."
    );
    return;
  }
  const categoryButtons = [];
  for (let i = 0; i < categories.length; i += 3) {
    categoryButtons.push(
      categories
        .slice(i, i + 3)
        .map((cat) => ({ text: cat, callback_data: `category_${cat}` }))
    );
  }

  bot.sendMessage(
    chatId,
    lang === "uz"
      ? "📌 Kategoriyalardan birini tanlang:"
      : "📌 Выберите категорию:",
    {
      reply_markup: { inline_keyboard: categoryButtons },
    }
  );
});

// Callback query uchun handler
bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
    const data = query.data;
    const lang = userLanguages[chatId] || "uz"; // Foydalanuvchining tanlagan tilini olish

    if (data.startsWith("category_")) {
      const category = data.replace("category_", "");
      const products = await getProducts(category);

      if (products.length === 0) {
        bot.sendMessage(
          chatId,
          lang === "uz"
            ? "Bu kategoriyada hech qanday mahsulot topilmadi."
            : "В этой категории товары не найдены."
        );
        return;
      }

      // Yangi xabar yuborish
      bot.sendMessage(
        chatId,
        lang === "uz"
          ? `📌 Siz tanlagan kategoriya: ${escapeMarkdown(category)}`
          : `📌 Вы выбрали категорию: ${escapeMarkdown(category)}`,
        { parse_mode: "Markdown" }
      );

      // Mahsulotlarni ko'rsatish
      for (const product of products) {
        function formatQuantity(quantity) {
          if (typeof quantity === "string") {
            quantity = quantity.replace(",", "."); // Vergulni nuqta bilan almashtiramiz
          }
          quantity = Number(quantity);
          return isNaN(quantity)
            ? "Noma'lum"
            : quantity >= 5
            ? "5+"
            : String(quantity);
        }

        const quantityText = formatQuantity(product.quantity);

        if (product.imageUrls.length > 0) {
          let mediaGroup = product.imageUrls.map((imageUrl, index) => ({
            type: "photo",
            media: imageUrl,
            caption:
              index === 0
                ? lang === "uz"
                  ? `📌 Model: ${escapeMarkdown(product.model)}\n📦 Mavjudligi: ${quantityText} dona`
                  : `📌 Модель: ${escapeMarkdown(product.model)}\n📦 В наличии: ${quantityText} шт`
                : "",
            parse_mode: "Markdown",
          }));
          await bot.sendMediaGroup(chatId, mediaGroup);
        } else {
          bot.sendMessage(
            chatId,
            lang === "uz"
              ? `📌 Model: ${escapeMarkdown(product.model)}\n📦 Mavjudligi: ${quantityText} dona`
              : `📌 Модель: ${escapeMarkdown(product.model)}\n📦 В наличии: ${quantityText} шт`,
            { parse_mode: "Markdown" }
          );
        }
      }

      // Yangi kategoriyalarni ko'rsatish
      const categories = await getCategories();
      const categoryButtons = [];
      for (let i = 0; i < categories.length; i += 3) {
        categoryButtons.push(
          categories
            .slice(i, i + 3)
            .map((cat) => ({ text: cat, callback_data: `category_${cat}` }))
        );
      }

      bot.sendMessage(
        chatId,
        lang === "uz"
          ? "📌 Kategoriyalardan birini tanlang:"
          : "📌 Выберите одну из категорий:",
        {
          reply_markup: { inline_keyboard: categoryButtons },
        }
      );
    }
  } catch (error) {
    console.error("Xatolik:", error);
   
  }
});







// Brak mahsulot kategoriyalarini yuklash funksiyasi
// defectKategoriyalarni yuklash funksiyasi
async function getdefectCategories() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Tosh_qoldiqlari_uchun!A2:A",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];
  return [...new Set(rows.flat())]; // Noyob kategoriyalar
}

// defectSubkategoriyalarni yuklash funksiyasi
async function getdefectSubcategories(category) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Tosh_qoldiqlari_uchun!A2:F",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  return [
    ...new Set(rows.filter((row) => row[0] === category).map((row) => row[3])),
  ]; // Subkategoriya ustuni (D ustuni), noyob qiymatlar
}

// Mahsulotlarni yuklash funksiyasi
async function getdefectProducts(category, subcategory) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Tosh_qoldiqlari_uchun!A2:F",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const filteredProducts = rows
    .filter((row) => row[0] === category && row[3] === subcategory)
    .map((row) => ({
      model: row[1]?.trim(),
      price: row[20]?.trim(),
      quantity: row[30]?.trim(),
      imageUrls: row[2] ? row[2].split(",").map((url) => url.trim()) : [],
    }));

  return filteredProducts;
}

// `/defect` komandasi uchun handler
bot.onText(/Tosh bo'laklari|Куски камня/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = userLanguages[chatId] || "uz";
  const categories = await getdefectCategories();
  if (categories.length === 0) {
    bot.sendMessage(
      chatId,
      lang === "uz"
        ? "📌 Hech qanday mahsulot topilmadi."
        : "📌 Товары не найдены."
    );
    return;
  }
  const categoryButtons = [];
  for (let i = 0; i < categories.length; i += 3) {
    categoryButtons.push(
      categories
        .slice(i, i + 3)
        .map((cat) => ({
          text: cat,
          callback_data: `defective_category_${cat}`,
        }))
    );
  }

  bot.sendMessage(
    chatId,
    lang === "uz"
      ? "📌Tosh bo'laklari kategoriyalardan birini tanlang:"
      : "📌 Выберите категорию Куски камня:",
    {
      reply_markup: { inline_keyboard: categoryButtons },
    }
  );
});

// Callback query uchun handler
// Callback query uchun handler
bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message.chat.id;
    const data = query.data;
    const lang = userLanguages[chatId] || "uz"; // Foydalanuvchining tanlagan tilini olish
    
    if (data.startsWith('defective_category_')) {
      const category = data.replace('defective_category_', '');
      const subcategories = await getdefectSubcategories(category);
      const subcategoryButtons = [];
      for (let i = 0; i < subcategories.length; i += 3) {
        subcategoryButtons.push(subcategories.slice(i, i + 3).map(sub => ({ text: sub, callback_data: `subcategory_${category}_${sub}` })));
      }
      
      const messageText = lang === "uz" 
        ? `📌 \"${escapeMarkdown(category)}\" kategoriyasidagi subkategoriyalardan birini tanlang:` 
        : `📌 Выберите подкатегорию из категории \"${escapeMarkdown(category)}\":`;
      
      await bot.sendMessage(chatId, messageText, {
        parse_mode: "MarkdownV2", // MarkdownV2 formatini ishlatish
        reply_markup: { inline_keyboard: subcategoryButtons },
      });
    
    } else if (data.startsWith('subcategory_')) {
      const [_, category, subcategory] = data.split('_');
      const products = await getdefectProducts(category, subcategory);

      if (products.length === 0) {
        bot.sendMessage(chatId, lang === "uz" 
          ? 'Bu subkategoriyada hech qanday mahsulot topilmadi.' 
          : 'В этой подкатегории товары не найдены.');
        return;
      }

      for (const product of products) {
        function formatQuantity(quantity) {
          if (typeof quantity === "string") {
            quantity = quantity.replace(',', '.'); // Vergulni nuqta bilan almashtiramiz
          }
          quantity = Number(quantity);
          return isNaN(quantity) ? "Noma'lum" : (quantity >= 5 ? "5+" : String(quantity));
        }
      
        const quantityText = formatQuantity(product.quantity);
      
        if (product.imageUrls.length > 0) {
          let mediaGroup = product.imageUrls.map((imageUrl, index) => ({
            type: 'photo',
            media: imageUrl,
            caption: index === 0 
              ? (lang === "uz" 
                  ? `📌 Model: ${escapeMarkdown(product.model)}\n` 
                  : `📌 Модель: ${escapeMarkdown(product.model)}\n`)
              : '',
            parse_mode: 'Markdown'
          }));
          await bot.sendMediaGroup(chatId, mediaGroup);
        } else {
          await bot.sendMessage(chatId, lang === "uz" 
            ? `📌 Model: ${escapeMarkdown(product.model)}\n` 
            : `📌 Модель: ${escapeMarkdown(product.model)}\n`, 
            { parse_mode: 'Markdown' });
        }
      }

      // Mahsulotlar chiqarilgandan keyin yana kategoriyalarni ko'rsatish
      const categories = await getdefectCategories();
      const categoryButtons = [];
      for (let i = 0; i < categories.length; i += 3) {
        categoryButtons.push(categories.slice(i, i + 3).map(cat => ({ text: cat, callback_data: `defective_category_${cat}` })));
      }

      await bot.sendMessage(chatId, lang === "uz" 
        ? "📌 Tosh bo'laklari kategoriyalaridan birini tanlang:"
        : '📌 Выберите одну из категорий Куски камня:', {
        reply_markup: { inline_keyboard: categoryButtons },
      });
    }
  } catch (error) {
    console.error("Xatolik:", error);
    bot.sendMessage(query.message.chat.id, "Xatolik yuz berdi, iltimos keyinroq urinib ko'ring.");
  }
});





// **1️⃣ Katalog tugmalarini "Katalog" dan yuklash**
async function getCatalogsFromSheets() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Katalog!A2:B", // Katalog nomi va PDF URL
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row) => ({ name: row[0], url: row[1] }));
}

// **2️⃣ Katalog tugmalarini chiqarish**
bot.onText(/Katalog|Каталог/, async (msg) => {
  const chatId = msg.chat.id;
  const lang = userLanguages[chatId] || "uz";

  const catalogs = await getCatalogsFromSheets();

  let keyboard = catalogs.map((catalog) => [
    { text: catalog.name, callback_data: `catalog_${catalog.name}` },
  ]);

  bot.sendMessage(chatId, lang === "uz" ? "📁 Kataloglar:" : "📁 Каталоги:", {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
});

bot.on("callback_query", async (query) => {
  try {
    const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data.replace("catalog_", "");
  await bot.answerCallbackQuery(query.id);

  // Matnni va tugmalarni to'liq o'chiramiz
  await bot.deleteMessage(chatId, messageId);

  const catalogs = await getCatalogsFromSheets();
  const selectedCatalog = catalogs.find((c) => c.name === data);

  if (selectedCatalog) {
    bot.sendDocument(chatId, selectedCatalog.url, {
      caption:
        userLanguages[chatId] === "uz"
          ? `📄 ${selectedCatalog.name} katalogi`
          : `📄 Каталог ${selectedCatalog.name}`,
    });
  }
    
  } catch (error) {
    console.log("Xatolik:", error);
    
  }
});



async function getBrands() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Brend!A2:B', // A ustunida brend nomlari, B ustunida linklar
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  return rows.map(row => ({ name: row[0], url: row[1] }));
    
  } catch (error) {
    console.log("Xatolik:", error);
    
  }
}

// `/Brendlar` komandasi uchun handler
bot.onText(/Brendlar|Бренды/, async (msg) => {
  try {
    const chatId = msg.chat.id;
  const lang = userLanguages[chatId] || "uz";

  const brands = await getBrands();
  if (brands.length === 0) {
      bot.sendMessage(chatId, lang === "uz" ? '📌 Hech qanday brend topilmadi.' : '📌 Бренды не найдены.');
      return;
  }

  // Brendlarni tugmalarga joylash
  const brandButtons = [];
for (let i = 0; i < brands.length; i += 3) {
  brandButtons.push(brands.slice(i, i + 3).map(brand => ({ text: brand.name, url: brand.url })));
}


  bot.sendMessage(chatId, lang === "uz" ? '📌 Bizning brendlar:' : '📌 Наши бренды:', {
      reply_markup: { inline_keyboard: brandButtons }
  });
    
  } catch (error) {
    console.log("Xatolik:", error);
    
  }
});

// Ijtimoiy tarmoqlarni yuklash funksiyasi
async function getSocialLinks() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Ijtimoiy_tarmoqlar!A2:B", // A ustunida tarmoq nomi, B ustunida linklar
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  return rows.map((row) => ({ name: row[0], url: row[1] }));
}

// `/Ijtimoiy tarmoqlar` komandasi uchun handler
bot.onText(/Ijtimoiy tarmoqlar|Социальные сети/, async (msg) => {
  try {
    const chatId = msg.chat.id;
  const lang = userLanguages[chatId] || "uz";

  const socialLinks = await getSocialLinks();
  if (socialLinks.length === 0) {
    bot.sendMessage(
      chatId,
      lang === "uz"
        ? "📌 Hech qanday ijtimoiy tarmoq topilmadi."
        : "📌 Социальные сети не найдены."
    );
    return;
  }

  // Tugmalarni 2tadan chiqarish
  const socialButtons = [];
  for (let i = 0; i < socialLinks.length; i += 2) {
    socialButtons.push(
      socialLinks
        .slice(i, i + 2)
        .map((link) => ({ text: link.name, url: link.url }))
    );
  }

  bot.sendMessage(
    chatId,
    lang === "uz"
      ? "📌 Bizning ijtimoiy tarmoqlar:"
      : "📌 Наши социальные сети:",
    {
      reply_markup: { inline_keyboard: socialButtons },
    }
  );
    
  } catch (error) {
    console.log("Xatolik:", error);
    
  }
});

// Mahsulotni izlash funksiyasi
async function searchProductByCode(chatId, code) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sotuvdagi_toshlar!A2:F",
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    bot.sendMessage(
      chatId,
      userLanguages[chatId] === "uz"
        ? "📌 Mahsulot topilmadi."
        : "📌 Товар не найден."
    );
    return;
  }

  const products = rows.filter(
    (row) => row[5]?.trim().toLowerCase() === code.trim().toLowerCase()
  );

  if (products.length === 0) {
    bot.sendMessage(
      chatId,
      userLanguages[chatId] === "uz"
        ? "📌 Mahsulot topilmadi."
        : "📌 Товар не найден."
    );
    return;
  }

  for (const product of products) {
    const lang = userLanguages[chatId] || "uz";
    //new
    function formatQuantity(quantity) {
      if (typeof quantity === "string") {
        quantity = quantity.replace(",", "."); // Vergulni nuqta bilan almashtiramiz
      }
      quantity = Number(quantity.trim());
      return isNaN(quantity)
        ? "Noma'lum"
        : quantity >= 5
        ? "5+"
        : String(quantity);
    }

    const productData = {
      model: product[1]?.trim() || "Noma'lum",
      price: product[2]?.trim() || "Noma'lum",
      quantity: formatQuantity(product[3]),
      imageUrls: product[4]
        ? product[4].split(",").map((url) => url.trim())
        : [],
    };
    //new
    let message =
      lang === "uz"
        ? `📌 Model: ${productData.model}\n📦 Mavjudligi: ${
            productData.quantity >= 5 ? "5+" : productData.quantity
          } dona`
        : `📌 Модель: ${productData.model}\n📦 В наличии: ${
            productData.quantity >= 5 ? "5+" : productData.quantity
          } шт`;

    if (productData.imageUrls.length > 0) {
      let mediaGroup = productData.imageUrls.map((imageUrl, imgIndex) => ({
        type: "photo",
        media: imageUrl,
        caption: imgIndex === 0 ? message : "",
      }));
      await bot.sendMediaGroup(chatId, mediaGroup);
    } else {
      await bot.sendMessage(chatId, message);
    }
  }

  // **Mahsulotlar tugaganidan keyin chiqariladigan xabar va tugmalar**
  const lang = userLanguages[chatId] || "uz";
  const followUpMessage =
    lang === "uz"
      ? "🔎 Yangi mahsulot kodini kiriting yoki boshqa bo‘limni tanlang:"
      : "🔎 Введите новый код товара или выберите другой раздел:";

  let keyboard =
    lang === "uz"
      ? [
          [{ text: "Mahsulotni izlash" }, { text: "Sotuvdagi toshlar" }],
          [{ text: "Katalog" }, { text: "Tosh bo'laklari" }],
          [{ text: "Brendlar" }, { text: "Ijtimoiy tarmoqlar" }],
          [{ text: "Tilni o‘zgartirish 🇺🇿 | 🇷🇺" }],
        ]
      : [
          [{ text: "Поиск товара" }, { text: "Камни в продажи" }],
          [{ text: "Каталог" }, { text: "Куски камня" }],
          [{ text: "Бренды" }, { text: "Социальные сети" }],
          [{ text: "Изменить язык 🇷🇺 | 🇺🇿" }],
        ];

  await bot.sendMessage(chatId, followUpMessage, {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
    },
  });
}

const userSearchState = {};

bot.on("message", (msg) => {
  try {
    const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Tugmalar ro‘yxati
  const buttons = [
    "Mahsulotni izlash",
    "Sotuvdagi toshlar",
    "Katalog",
    "Tosh bo'laklari",
    "Brendlar",
    "Ijtimoiy tarmoqlar",
    "Tilni o‘zgartirish 🇺🇿 | 🇷🇺",
    "Поиск товара",
    "Камни в продажи",
    "Каталог",
    "Куски камня",
    "Бренды",
    "Социальные сети",
    "Изменить язык 🇷🇺 | 🇺🇿",
  ];

  if (text === "Mahsulotni izlash" || text === "Поиск товара") {
    userSearchState[chatId] = true;
    bot.sendMessage(
      chatId,
      userLanguages[chatId] === "uz"
        ? "📌 Mahsulot kodini kiriting:"
        : "📌 Введите код товара:"
    );
    return;
  }

  // Agar foydalanuvchi tugmalardan birini bossin, userSearchState ni o‘chirib qo‘yamiz
  if (buttons.includes(text)) {
    userSearchState[chatId] = false;
    return;
  }

  // **Istalgan vaqtda mahsulot kodini qidirish**
  if (/^[A-Za-z0-9\-_\.]+$/.test(text)) {
    searchProductByCode(chatId, text);
    return;
  }
    
  } catch (error) {
    console.log("Xatolik:", error);
    
  }
});


