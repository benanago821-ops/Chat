```javascript
/* =========================================================
   NovaChat - app.js
   GitHub Pages + Supabase
   امکانات:
   - ثبت‌نام و ورود
   - تأیید ایمیل با مسیر صحیح
   - خروج از حساب
   - جست‌وجوی کاربران
   - درخواست و مدیریت مخاطب
   - گفت‌وگوی خصوصی
   - پیام‌رسانی زنده
   - تغییر تم
   ========================================================= */

"use strict";

/* ---------- تنظیمات Supabase ---------- */

const SUPABASE_URL = "https://sacxosekpcnmhvcdduhg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_G5TXiF0sniOKG4z0qvBKFw_o6v_As3F";

const SITE_URL = "https://benanago821-ops.github.io/Chat/";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

/* ---------- وضعیت برنامه ---------- */

let currentUser = null;
let currentProfile = null;
let currentConversationId = null;
let messageSubscription = null;
let profileSubscription = null;

/* ---------- ابزارهای عمومی ---------- */

const $ = (selector) => document.querySelector(selector);

function getElement(...selectors) {
  for (const selector of selectors) {
    const element = $(selector);
    if (element) return element;
  }
  return null;
}

function showMessage(message, type = "info") {
  const target = getElement(
    "#statusMessage",
    "#status-message",
    "#notification",
    "#toast",
    "[data-status-message]"
  );

  if (target) {
    target.textContent = message;
    target.dataset.type = type;
    target.hidden = false;
    return;
  }

  console.log(`[NovaChat ${type}] ${message}`);
}

function setText(selectors, value) {
  const element = getElement(...selectors);
  if (element) element.textContent = value ?? "";
}

function setVisible(element, visible) {
  if (element) element.hidden = !visible;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function validUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function friendlyError(error) {
  const message = error?.message || "خطای ناشناخته";

  if (/Invalid login credentials/i.test(message)) {
    return "ایمیل یا رمز عبور اشتباه است.";
  }

  if (/User already registered/i.test(message)) {
    return "این ایمیل قبلاً ثبت‌نام کرده است.";
  }

  if (/Email not confirmed/i.test(message)) {
    return "ابتدا ایمیل خود را تأیید کن.";
  }

  if (/duplicate key/i.test(message)) {
    return "این نام کاربری قبلاً انتخاب شده است.";
  }

  return message;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("fa-IR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function disableButton(button, disabled) {
  if (button) button.disabled = disabled;
}

/* ---------- مدیریت صفحه و بخش‌ها ---------- */

function showSection(sectionName) {
  const sections = document.querySelectorAll(
    "[data-section], .app-section, .auth-section"
  );

  sections.forEach((section) => {
    const name =
      section.dataset.section ||
      section.id ||
      "";

    const matches =
      name === sectionName ||
      name === `${sectionName}Section` ||
      name === `${sectionName}-section`;

    section.hidden = !matches;
  });
}

function showAuthUI() {
  const auth = getElement("#authSection", "#auth-section", "#authView");
  const app = getElement("#appSection", "#app-section", "#appView");

  setVisible(auth, true);
  setVisible(app, false);

  showSection("auth");
}

function showAppUI() {
  const auth = getElement("#authSection", "#auth-section", "#authView");
  const app = getElement("#appSection", "#app-section", "#appView");

  setVisible(auth, false);
  setVisible(app, true);

  showSection("app");
}

/* ---------- ثبت‌نام ---------- */

async function signUp(event) {
  event?.preventDefault();

  const emailInput = getElement(
    "#signupEmail",
    "#registerEmail",
    'input[name="signupEmail"]',
    'input[name="email"]'
  );

  const passwordInput = getElement(
    "#signupPassword",
    "#registerPassword",
    'input[name="signupPassword"]',
    'input[name="password"]'
  );

  const usernameInput = getElement(
    "#signupUsername",
    "#registerUsername",
    'input[name="username"]'
  );

  const displayNameInput = getElement(
    "#signupDisplayName",
    "#registerDisplayName",
    'input[name="display_name"]',
    'input[name="displayName"]'
  );

  const email = emailInput?.value.trim().toLowerCase();
  const password = passwordInput?.value ?? "";
  const username = normalizeUsername(usernameInput?.value);
  const displayName = displayNameInput?.value.trim() || username;

  if (!email || !password || !username) {
    showMessage("ایمیل، رمز عبور و نام کاربری را وارد کن.", "error");
    return;
  }

  if (!validUsername(username)) {
    showMessage(
      "نام کاربری باید ۳ تا ۲۴ حرف باشد و فقط حروف انگلیسی کوچک، عدد و _ داشته باشد.",
      "error"
    );
    return;
  }

  if (password.length < 6) {
    showMessage("رمز عبور باید حداقل ۶ کاراکتر باشد.", "error");
    return;
  }

  const button = getElement(
    "#signupButton",
    "#registerButton",
    'button[type="submit"][data-action="signup"]'
  );

  disableButton(button, true);

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        // مقصد تأیید ایمیل: مسیر درست پروژه در GitHub Pages
        emailRedirectTo: SITE_URL,
        data: {
          username,
          display_name: displayName
        }
      }
    });

    if (error) throw error;

    if (data?.user && !data.session) {
      showMessage(
        "ثبت‌نام انجام شد. ایمیلت را باز کن و لینک تأیید جدید را بزن. سپس وارد سایت شو.",
        "success"
      );
    } else if (data?.session) {
      currentUser = data.user;
      await loadCurrentProfile();
      showMessage("ثبت‌نام با موفقیت انجام شد.", "success");
    }
  } catch (error) {
    console.error("Signup error:", error);
    showMessage(friendlyError(error), "error");
  } finally {
    disableButton(button, false);
  }
}

/* ---------- ورود ---------- */

async function signIn(event) {
  event?.preventDefault();

  const emailInput = getElement(
    "#loginEmail",
    "#signinEmail",
    'input[name="loginEmail"]',
    'input[name="email"]'
  );

  const passwordInput = getElement(
    "#loginPassword",
    "#signinPassword",
    'input[name="loginPassword"]',
    'input[name="password"]'
  );

  const email = emailInput?.value.trim().toLowerCase();
  const password = passwordInput?.value ?? "";

  if (!email || !password) {
    showMessage("ایمیل و رمز عبور را وارد کن.", "error");
    return;
  }

  const button = getElement(
    "#loginButton",
    "#signinButton",
    'button[type="submit"][data-action="login"]'
  );

  disableButton(button, true);

  try {
    const { data, error } =
      await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

    if (error) throw error;

    currentUser = data.user;
    await loadCurrentProfile();

    showMessage("با موفقیت وارد شدی.", "success");
  } catch (error) {
    console.error("Login error:", error);
    showMessage(friendlyError(error), "error");
  } finally {
    disableButton(button, false);
  }
}

/* ---------- خروج ---------- */

async function signOut() {
  try {
    await cleanupSubscriptions();

    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentProfile = null;
    currentConversationId = null;

    showAuthUI();
    showMessage("از حساب خارج شدی.", "success");
  } catch (error) {
    console.error("Sign out error:", error);
    showMessage(friendlyError(error), "error");
  }
}

/* ---------- دریافت پروفایل کاربر ---------- */

async function loadCurrentProfile() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile loading error:", error);
    showMessage("دریافت اطلاعات حساب ناموفق بود.", "error");
    return;
  }

  currentProfile = data;

  if (!currentProfile) {
    showMessage(
      "پروفایل هنوز ساخته نشده است. تنظیمات جدول profiles و تریگر ثبت‌نام را بررسی کن.",
      "error"
    );
    return;
  }

  setText(
    ["#currentUsername", "#profileUsername", "[data-current-username]"],
    `@${currentProfile.username}`
  );

  setText(
    ["#currentDisplayName", "#profileDisplayName", "[data-current-name]"],
    currentProfile.display_name || currentProfile.username
  );

  showAppUI();

  await loadContacts();
  await loadContactRequests();
}

/* ---------- جست‌وجوی کاربر ---------- */

async function searchUsers(event) {
  event?.preventDefault();

  if (!currentUser) {
    showMessage("ابتدا وارد حساب شو.", "error");
    return;
  }

  const input = getElement(
    "#searchUsername",
    "#userSearch",
    "#searchInput",
    'input[name="searchUsername"]'
  );

  const username = normalizeUsername(input?.value);

  if (!username) {
    showMessage("نام کاربری را وارد کن.", "error");
    return;
  }

  if (!validUsername(username)) {
    showMessage("فرمت نام کاربری معتبر نیست.", "error");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .neq("id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    renderSearchResult(data);
  } catch (error) {
    console.error("User search error:", error);
    showMessage(friendlyError(error), "error");
  }
}

function renderSearchResult(profile) {
  const container = getElement(
    "#searchResults",
    "#search-results",
    "#userSearchResults"
  );

  if (!container) {
    if (profile) {
      showMessage(
        `کاربر پیدا شد: @${profile.username}`,
        "success"
      );
    } else {
      showMessage("کاربری با این نام پیدا نشد.", "info");
    }
    return;
  }

  container.replaceChildren();

  if (!profile) {
    const empty = document.createElement("p");
    empty.textContent = "کاربری پیدا نشد.";
    container.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "search-result-item";

  const name = document.createElement("span");
  name.textContent =
    `${profile.display_name || profile.username} (@${profile.username})`;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "افزودن مخاطب";
  button.addEventListener("click", () => sendContactRequest(profile.id));

  card.append(name, button);
  container.appendChild(card);
}

/* ---------- ارسال درخواست مخاطب ---------- */

async function sendContactRequest(receiverId) {
  if (!currentUser || receiverId === currentUser.id) {
    showMessage("نمی‌توانی به خودت درخواست بدهی.", "error");
    return;
  }

  try {
    const { data: existing, error: checkError } =
      await supabaseClient
        .from("contact_requests")
        .select("id, status")
        .or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUser.id})`
        )
        .limit(1);

    if (checkError) throw checkError;

    if (existing?.length) {
      showMessage("برای این کاربر درخواست یا ارتباط قبلی وجود دارد.", "info");
      return;
    }

    const { error } = await supabaseClient
      .from("contact_requests")
      .insert({
        sender_id: currentUser.id,
        receiver_id: receiverId,
        status: "pending"
      });

    if (error) throw error;

    showMessage("درخواست مخاطب ارسال شد.", "success");
  } catch (error) {
    console.error("Contact request error:", error);
    showMessage(friendlyError(error), "error");
  }
}

/* ---------- دریافت درخواست‌های مخاطب ---------- */

async function loadContactRequests() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("contact_requests")
      .select("id, sender_id, receiver_id, status, created_at")
      .eq("receiver_id", currentUser.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const container = getElement(
      "#contactRequests",
      "#contact-requests",
      "#requestsList"
    );

    if (!container) return;

    container.replaceChildren();

    if (!data?.length) {
      const empty = document.createElement("p");
      empty.textContent = "درخواست جدیدی نداری.";
      container.appendChild(empty);
      return;
    }

    for (const request of data) {
      const profile = await getProfileById(request.sender_id);

      const item = document.createElement("div");
      item.className = "contact-request-item";

      const label = document.createElement("span");
      label.textContent = profile
        ? `${profile.display_name || profile.username} (@${profile.username})`
        : "کاربر";

      const accept = document.createElement("button");
      accept.type = "button";
      accept.textContent = "پذیرفتن";
      accept.addEventListener("click", () =>
        respondToContactRequest(request.id, "accepted")
      );

      const reject = document.createElement("button");
      reject.type = "button";
      reject.textContent = "رد کردن";
      reject.addEventListener("click", () =>
        respondToContactRequest(request.id, "rejected")
      );

      item.append(label, accept, reject);
      container.appendChild(item);
    }
  } catch (error) {
    console.error("Loading contact requests error:", error);
    showMessage(friendlyError(error), "error");
  }
}

async function respondToContactRequest(requestId, status) {
  if (!["accepted", "rejected"].includes(status)) return;

  try {
    const { error } = await supabaseClient
      .from("contact_requests")
      .update({ status })
      .eq("id", requestId)
      .eq("receiver_id", currentUser.id)
      .eq("status", "pending");

    if (error) throw error;

    showMessage(
      status === "accepted"
        ? "درخواست پذیرفته شد."
        : "درخواست رد شد.",
      "success"
    );

    await loadContactRequests();
    await loadContacts();
  } catch (error) {
    console.error("Responding to request error:", error);
    showMessage(friendlyError(error), "error");
  }
}

/* ---------- دریافت مخاطبان ---------- */

async function loadContacts() {
  if (!currentUser) return;

  try {
    const { data: requests, error } = await supabaseClient
      .from("contact_requests")
      .select("sender_id, receiver_id, status")
      .eq("status", "accepted")
      .or(
        `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
      );

    if (error) throw error;

    const ids = [...new Set((requests || []).map((request) =>
      request.sender_id === currentUser.id
        ? request.receiver_id
        : request.sender_id
    ))];

    const container = getElement(
      "#contactsList",
      "#contacts-list",
      "#contacts"
    );

    if (!container) return;

    container.replaceChildren();

    if (!ids.length) {
      const empty = document.createElement("p");
      empty.textContent = "هنوز مخاطبی نداری.";
      container.appendChild(empty);
      return;
    }

    for (const id of ids) {
      const profile = await getProfileById(id);
      if (!profile) continue;

      const item = document.createElement("div");
      item.className = "contact-item";

      const label = document.createElement("span");
      label.textContent =
        `${profile.display_name || profile.username} (@${profile.username})`;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "گفت‌وگو";
      button.addEventListener("click", () => openConversation(profile));

      item.append(label, button);
      container.appendChild(item);
    }
  } catch (error) {
    console.error("Loading contacts error:", error);
    showMessage(friendlyError(error), "error");
  }
}

async function getProfileById(id) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Getting profile error:", error);
    return null;
  }

  return data;
}

/* ---------- بازکردن گفت‌وگوی خصوصی ---------- */

async function openConversation(profile) {
  if (!currentUser || !profile?.id) return;

  try {
    const { data, error } = await supabaseClient.rpc(
      "create_direct_conversation",
      {
        p_other_user_id: profile.id
      }
    );

    if (error) throw error;

    // تابع SQL ممکن است شناسه را به شکل UUID یا آرایه برگرداند.
    const conversationId = Array.isArray(data)
      ? data[0]?.conversation_id || data[0]?.id
      : typeof data === "object" && data !== null
        ? data.conversation_id || data.id
        : data;

    if (!conversationId) {
      throw new Error(
        "شناسه گفت‌وگو دریافت نشد. نام پارامتر و مقدار بازگشتی تابع SQL را بررسی کن."
      );
    }

    currentConversationId = conversationId;

    setText(
      ["#chatTitle", "#conversationTitle", "[data-chat-title]"],
      profile.display_name || profile.username
    );

    const chat = getElement(
      "#chatSection",
      "#chat-section",
      "#chatView"
    );

    if (chat) setVisible(chat, true);

    await loadMessages();
    await subscribeToMessages();

    showMessage("گفت‌وگو باز شد.", "success");
  } catch (error) {
    console.error("Open conversation error:", error);
    showMessage(
      "بازکردن گفت‌وگو ناموفق بود. اگر خطای RPC دریافت شد، نام پارامتر تابع create_direct_conversation را با SQL تطبیق بده. جزئیات: " +
        friendlyError(error),
      "error"
    );
  }
}

/* ---------- دریافت پیام‌ها ---------- */

async function loadMessages() {
  if (!currentUser || !currentConversationId) return;

  try {
    const { data, error } = await supabaseClient
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", currentConversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    renderMessages(data || []);
  } catch (error) {
    console.error("Loading messages error:", error);
    showMessage(friendlyError(error), "error");
  }
}

function renderMessages(messages) {
  const container = getElement(
    "#messagesList",
    "#messages",
    "#chatMessages",
    "#messageList"
  );

  if (!container) return;

  container.replaceChildren();

  for (const message of messages) {
    const item = document.createElement("div");
    item.className = "message-item";

    item.classList.add(
      message.sender_id === currentUser?.id
        ? "my-message"
        : "other-message"
    );

    const body = document.createElement("p");
    body.textContent = message.body;

    const time = document.createElement("small");
    time.textContent = formatDate(message.created_at);

    item.append(body, time);
    container.appendChild(item);
  }

  container.scrollTop = container.scrollHeight;
}

/* ---------- ارسال پیام ---------- */

async function sendMessage(event) {
  event?.preventDefault();

  if (!currentUser || !currentConversationId) {
    showMessage("ابتدا یک گفت‌وگو را باز کن.", "error");
    return;
  }

  const input = getElement(
    "#messageInput",
    "#chatMessageInput",
    'textarea[name="message"]',
    'input[name="message"]'
  );

  const body = input?.value.trim();

  if (!body) return;

  if (body.length > 5000) {
    showMessage("پیام نباید بیشتر از ۵۰۰۰ کاراکتر باشد.", "error");
    return;
  }

  const button = getElement(
    "#sendMessageButton",
    "#sendButton",
    'button[type="submit"][data-action="send-message"]'
  );

  disableButton(button, true);

  try {
    const { error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: currentConversationId,
        sender_id: currentUser.id,
        body
      });

    if (error) throw error;

    if (input) input.value = "";

    // برای اطمینان، پیام‌های تازه را دوباره دریافت می‌کنیم.
    await loadMessages();
  } catch (error) {
    console.error("Sending message error:", error);
    showMessage(friendlyError(error), "error");
  } finally {
    disableButton(button, false);
  }
}

/* ---------- دریافت زنده پیام‌ها ---------- */

async function subscribeToMessages() {
  if (!currentConversationId) return;

  if (messageSubscription) {
    await supabaseClient.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  const conversationId = currentConversationId;

  messageSubscription = supabaseClient
    .channel(`messages-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        if (currentConversationId !== conversationId) return;

        const incoming = payload.new;

        const container = getElement(
          "#messagesList",
          "#messages",
          "#chatMessages",
          "#messageList"
        );

        if (
          container &&
          !container.querySelector(
            `[data-message-id="${CSS.escape(String(incoming.id))}"]`
          )
        ) {
          await loadMessages();
        }
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        console.error("Realtime subscription failed.");
      }
    });
}

/* ---------- پاک‌سازی اشتراک‌ها ---------- */

async function cleanupSubscriptions() {
  if (messageSubscription) {
    await supabaseClient.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  if (profileSubscription) {
    await supabaseClient.removeChannel(profileSubscription);
    profileSubscription = null;
  }
}

/* ---------- تغییر تم ---------- */

function setTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";

  document.documentElement.dataset.theme = selectedTheme;
  document.body.dataset.theme = selectedTheme;

  const themeButton = getElement(
    "#themeToggle",
    "#toggleTheme",
    "[data-action='toggle-theme']"
  );

  if (themeButton) {
    themeButton.textContent =
      selectedTheme === "dark" ? "☀️ تم روشن" : "🌙 تم تاریک";
  }
}

function toggleTheme() {
  const current =
    document.documentElement.dataset.theme ||
    document.body.dataset.theme ||
    "dark";

  setTheme(current === "dark" ? "light" : "dark");
}

/* ---------- راه‌اندازی فرم‌ها و دکمه‌ها ---------- */

function bindSubmit(selectors, handler) {
  const element = getElement(...selectors);
  if (!element) return;

  element.addEventListener("submit", handler);

  // اگر selector به یک دکمه اشاره کرده باشد، submit لازم نیست.
  if (element.tagName === "BUTTON") {
    element.addEventListener("click", handler);
  }
}

function bindClick(selectors, handler) {
  const element = getElement(...selectors);
  if (element) {
    element.addEventListener("click", handler);
  }
}

function bindUI() {
  bindSubmit(
    ["#signupForm", "#registerForm", "[data-form='signup']"],
    signUp
  );

  bindSubmit(
    ["#loginForm", "#signinForm", "[data-form='login']"],
    signIn
  );

  bindSubmit(
    ["#searchForm", "#userSearchForm", "[data-form='search-users']"],
    searchUsers
  );

  bindSubmit(
    ["#sendMessageForm", "#messageForm", "[data-form='send-message']"],
    sendMessage
  );

  bindClick(
    ["#signupButton", "#registerButton", "[data-action='signup']"],
    (event) => {
      if (event.currentTarget.tagName === "BUTTON" &&
          event.currentTarget.type !== "submit") {
        signUp(event);
      }
    }
  );

  bindClick(
    ["#loginButton", "#signinButton", "[data-action='login']"],
    (event) => {
      if (event.currentTarget.tagName === "BUTTON" &&
          event.currentTarget.type !== "submit") {
        signIn(event);
      }
    }
  );

  bindClick(
    ["#searchButton", "[data-action='search-users']"],
    searchUsers
  );

  bindClick(
    ["#sendMessageButton", "#sendButton", "[data-action='send-message']"],
    (event) => {
      const form = event.currentTarget.closest("form");

      if (!form) sendMessage(event);
    }
  );

  bindClick(
    ["#logoutButton", "#signoutButton", "[data-action='logout']"],
    signOut
  );

  bindClick(
    ["#themeToggle", "#toggleTheme", "[data-action='toggle-theme']"],
    toggleTheme
  );

  const messageInput = getElement(
    "#messageInput",
    "#chatMessageInput",
    'textarea[name="message"]'
  );

  if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();

        const form = messageInput.closest("form");

        if (form) {
          if (typeof form.requestSubmit === "function") {
            form.requestSubmit();
          } else {
            sendMessage(event);
          }
        } else {
          sendMessage(event);
        }
      }
    });
  }
}

/* ---------- مدیریت نشست و لینک تأیید ایمیل ---------- */

async function initializeApp() {
  bindUI();

  try {
    // اگر تم را با CSS متغیرها پشتیبانی می‌کنی، این مقدار پیش‌فرض اعمال می‌شود.
    setTheme("dark");

    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    const session = data?.session;

    if (session?.user) {
      currentUser = session.user;
      await loadCurrentProfile();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuthUI();
    }

    supabaseClient.auth.onAuthStateChange(
      async (event, sessionData) => {
        if (event === "SIGNED_OUT") {
          currentUser = null;
          currentProfile = null;
          currentConversationId = null;

          await cleanupSubscriptions();
          showAuthUI();
          return;
        }

        if (
          sessionData?.user &&
          ["SIGNED_IN", "USER_UPDATED", "INITIAL_SESSION"].includes(event)
        ) {
          currentUser = sessionData.user;
          await loadCurrentProfile();
        }
      }
    );

    // اگر مسیر فعلی همان مسیر اصلی سایت است، ادامه می‌دهیم.
    // تأیید ایمیل باید با emailRedirectTo و تنظیمات Supabase به همین URL برگردد.
    if (window.location.pathname !== new URL(SITE_URL).pathname) {
      console.info(
        "مسیر فعلی با مسیر اصلی GitHub Pages متفاوت است:",
        window.location.pathname
      );
    }
  } catch (error) {
    console.error("Initialization error:", error);
    showMessage(friendlyError(error), "error");
  }
}

document.addEventListener("DOMContentLoaded", initializeApp);

/* ---------- توابع قابل استفاده از HTML ---------- */

window.NovaChat = {
  signUp,
  signIn,
  signOut,
  searchUsers,
  sendContactRequest,
  loadContactRequests,
  loadContacts,
  openConversation,
  loadMessages,
  sendMessage,
  toggleTheme,
  setTheme
};
```
