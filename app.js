
/* ==========================================
   NovaChat — Supabase application
   فقط کلید عمومی Publishable در مرورگر
========================================== */

const SUPABASE_URL = "https://sacxosekpcnmhvcdduhg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G5TXiF0sniOKG4z0qvBKFw_o6v_As3F";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (selector) => document.querySelector(selector);

const authView = $("#auth-view");
const chatView = $("#chat-view");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const searchInput = $("#user-search");
const searchResults = $("#search-results");
const contactList = $("#contact-list");
const pendingRequests = $("#pending-requests");
const messagesBox = $("#messages");
const messageForm = $("#message-form");
const messageInput = $("#message-input");
const emptyChat = $("#empty-chat");
const activeChat = $("#active-chat");
const toastElement = $("#toast");

let currentUser = null;
let currentProfile = null;
let activeConversationId = null;
let activePeer = null;
let messageSubscription = null;
let searchTimer = null;
let toastTimer = null;
let knownMessageIds = new Set();

/* ---------- پیام‌های اطلاع‌رسانی ---------- */

function notify(message) {
  toastElement.textContent = message;
  toastElement.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3200);
}

function setLoading(form, loading) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  if (loading) {
    button.dataset.oldText = button.textContent;
    button.textContent = "لطفاً صبر کن...";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || "ادامه";
    button.disabled = false;
  }
}

function getInitial(name) {
  return (name || "N").trim().charAt(0).toUpperCase() || "N";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function friendlyError(error) {
  const message = error?.message || "";

  if (/Invalid login credentials/i.test(message)) {
    return "ایمیل یا رمز عبور اشتباه است.";
  }

  if (/User already registered/i.test(message)) {
    return "این ایمیل قبلاً ثبت‌نام کرده است.";
  }

  if (/duplicate key|profiles_username_key/i.test(message)) {
    return "این نام کاربری قبلاً انتخاب شده است.";
  }

  if (/Email not confirmed/i.test(message)) {
    return "ابتدا ایمیلت را تأیید کن.";
  }

  return message || "مشکلی پیش آمد؛ دوباره تلاش کن.";
}

/* ---------- تغییر فرم ورود و ثبت‌نام ---------- */

document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((item) => {
      item.classList.toggle("active", item === tab);
    });

    const isSignup = tab.dataset.authTab === "signup";
    loginForm.classList.toggle("hidden", isSignup);
    signupForm.classList.toggle("hidden", !isSignup);
  });
});

/* ---------- ثبت‌نام ---------- */

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const displayName = $("#signup-name").value.trim();
  const username = $("#signup-username").value.trim().toLowerCase();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    notify("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.");
    return;
  }

  if (password.length < 8) {
    notify("رمز عبور باید حداقل ۸ کاراکتر باشد.");
    return;
  }

  setLoading(signupForm, true);

  try {
    // بررسی اولیه برای نمایش سریع‌تر خطای نام کاربری تکراری.
    // کنترل نهایی باید در دیتابیس انجام شود.
    const { data: existing, error: lookupError } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing) {
      notify("این نام کاربری قبلاً انتخاب شده است.");
      return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      notify("حساب ساخته شد؛ خوش آمدی!");
      await loadApplication(data.session.user);
    } else {
      notify("ثبت‌نام انجام شد. اگر تأیید ایمیل فعال است، ایمیلت را بررسی کن.");
    }
  } catch (error) {
    console.error("Signup error:", error);
    notify(friendlyError(error));
  } finally {
    setLoading(signupForm, false);
  }
});

/* ---------- ورود ---------- */

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  setLoading(loginForm, true);

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await loadApplication(data.user);
    notify("با موفقیت وارد شدی.");
  } catch (error) {
    console.error("Login error:", error);
    notify(friendlyError(error));
  } finally {
    setLoading(loginForm, false);
  }
});

/* ---------- خروج ---------- */

$("#logout-btn").addEventListener("click", async () => {
  if (messageSubscription) {
    await supabaseClient.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    notify(friendlyError(error));
    return;
  }

  currentUser = null;
  currentProfile = null;
  activePeer = null;
  activeConversationId = null;

  chatView.classList.add("hidden");
  authView.classList.remove("hidden");

  notify("از حساب خارج شدی.");
});

/* ---------- بارگذاری حساب ---------- */

async function loadApplication(user) {
  currentUser = user;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Profile error:", error);
    notify("پروفایل پیدا نشد. تنظیمات دیتابیس را بررسی کن.");
    return;
  }

  currentProfile = profile;

  $("#my-display-name").textContent = profile.display_name;
  $("#my-username").textContent = "@" + profile.username;
  $("#my-avatar").textContent = getInitial(profile.display_name);

  authView.classList.add("hidden");
  chatView.classList.remove("hidden");

  await loadRequests();
  await loadContacts();
}

/* ---------- جست‌وجوی کاربران ---------- */

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  const query = searchInput.value.trim().toLowerCase();

  if (query.length < 3) {
    searchResults.replaceChildren();
    return;
  }

  searchTimer = setTimeout(() => searchUsers(query), 300);
});

async function searchUsers(query) {
  if (!currentUser) return;

  searchResults.innerHTML = `<p class="muted">در حال جست‌وجو...</p>`;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", query.replace(/[%_]/g, "\\$&") + "%")
    .neq("id", currentUser.id)
    .order("username")
    .limit(15);

  if (error) {
    console.error("Search error:", error);
    searchResults.innerHTML = "";
    notify("جست‌وجو انجام نشد؛ دسترسی پروفایل‌ها را بررسی کن.");
    return;
  }

  searchResults.replaceChildren();

  if (!data.length) {
    searchResults.innerHTML = `<p class="muted">کاربری پیدا نشد.</p>`;
    return;
  }

  for (const profile of data) {
    const item = document.createElement("div");
    item.className = "user-item";

    item.innerHTML = `
      <div class="avatar">${escapeHTML(getInitial(profile.display_name))}</div>
      <div>
        <strong>${escapeHTML(profile.display_name)}</strong>
        <small>@${escapeHTML(profile.username)}</small>
      </div>
      <span class="item-action">افزودن</span>
    `;

    item.querySelector(".item-action").addEventListener("click", () => {
      sendContactRequest(profile);
    });

    searchResults.appendChild(item);
  }
}

/* ---------- ارسال درخواست ارتباط ---------- */

async function sendContactRequest(profile) {
  if (!currentUser || profile.id === currentUser.id) return;

  const { data: existing, error: checkError } = await supabaseClient
    .from("contact_requests")
    .select("id, sender_id, receiver_id, status")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${profile.id}),` +
      `and(sender_id.eq.${profile.id},receiver_id.eq.${currentUser.id})`
    )
    .limit(10);

  if (checkError) {
    console.error(checkError);
    notify("وضعیت درخواست بررسی نشد.");
    return;
  }

  const requests = existing || [];

  if (requests.some((r) => r.status === "accepted")) {
    notify("این ارتباط از قبل پذیرفته شده است.");
    return;
  }

  const incoming = requests.find(
    (r) => r.sender_id === profile.id &&
           r.receiver_id === currentUser.id &&
           r.status === "pending"
  );

  if (incoming) {
    notify("این کاربر قبلاً برایت درخواست فرستاده؛ درخواست‌های دریافتی را بررسی کن.");
    await loadRequests();
    return;
  }

  if (requests.some(
    (r) => r.sender_id === currentUser.id &&
           r.receiver_id === profile.id &&
           r.status === "pending"
  )) {
    notify("درخواست قبلاً فرستاده شده است.");
    return;
  }

  const { error } = await supabaseClient
    .from("contact_requests")
    .insert({
      sender_id: currentUser.id,
      receiver_id: profile.id,
      status: "pending"
    });

  if (error) {
    console.error("Request error:", error);
    notify(friendlyError(error));
    return;
  }

  notify("درخواست ارتباط ارسال شد.");
  await loadRequests();
}

/* ---------- درخواست‌های دریافتی ---------- */

async function loadRequests() {
  if (!currentUser) return;

  const { data: requests, error } = await supabaseClient
    .from("contact_requests")
    .select("id, sender_id, status")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending")
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Load requests error:", error);
    return;
  }

  pendingRequests.replaceChildren();

  if (!requests?.length) return;

  const title = document.createElement("div");
  title.className = "request-title";
  title.textContent = "درخواست‌های دریافتی";
  pendingRequests.appendChild(title);

  for (const request of requests) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", request.sender_id)
      .maybeSingle();

    if (!profile) continue;

    const item = document.createElement("div");
    item.className = "user-item";
    item.innerHTML = `
      <div class="avatar">${escapeHTML(getInitial(profile.display_name))}</div>
      <div>
        <strong>${escapeHTML(profile.display_name)}</strong>
        <small>@${escapeHTML(profile.username)}</small>
        <div class="request-actions">
          <button class="accept">پذیرفتن</button>
          <button class="reject">رد کردن</button>
        </div>
      </div>
    `;

    item.querySelector(".accept").addEventListener("click", () => {
      respondToRequest(request.id, "accepted");
    });

    item.querySelector(".reject").addEventListener("click", () => {
      respondToRequest(request.id, "rejected");
    });

    pendingRequests.appendChild(item);
  }
}

async function respondToRequest(requestId, status) {
  const { error } = await supabaseClient
    .from("contact_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    notify(friendlyError(error));
    return;
  }

  notify(status === "accepted" ? "درخواست پذیرفته شد." : "درخواست رد شد.");

  await loadRequests();
  await loadContacts();
}

/* ---------- فهرست ارتباط‌های پذیرفته‌شده ---------- */

async function loadContacts() {
  if (!currentUser) return;

  const { data: rows, error } = await supabaseClient
    .from("contact_requests")
    .select("sender_id, receiver_id")
    .eq("status", "accepted")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .limit(200);

  if (error) {
    console.error("Contacts error:", error);
    notify("فهرست ارتباط‌ها بارگذاری نشد.");
    return;
  }

  const ids = [...new Set((rows || []).map((row) =>
    row.sender_id === currentUser.id ? row.receiver_id : row.sender_id
  ))];

  contactList.replaceChildren();
  $("#contact-count").textContent = new Intl.NumberFormat("fa-IR").format(ids.length);

  if (!ids.length) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "هنوز ارتباطی نداری؛ نام کاربری را جست‌وجو کن.";
    contactList.appendChild(hint);
    return;
  }

  const { data: profiles, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .in("id", ids);

  if (profileError) {
    console.error(profileError);
    return;
  }

  for (const profile of profiles || []) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "user-item";
    item.innerHTML = `
      <div class="avatar">${escapeHTML(getInitial(profile.display_name))}</div>
      <div>
        <strong>${escapeHTML(profile.display_name)}</strong>
        <small>@${escapeHTML(profile.username)}</small>
      </div>
      <span class="item-action">چت</span>
    `;

    item.addEventListener("click", () => openDirectChat(profile));
    contactList.appendChild(item);
  }
}

/* ---------- شروع گفت‌وگوی خصوصی ---------- */

async function openDirectChat(profile) {
  if (!currentUser || profile.id === currentUser.id) return;

  try {
    /*
      توجه: نام پارامتر باید دقیقاً با نام آرگومان تابع
      create_direct_conversation در دیتابیس یکسان باشد.
      در این نمونه نام آرگومان p_other_user_id فرض شده است.
    */
    const { data: conversationId, error } = await supabaseClient.rpc(
      "create_direct_conversation",
      { p_other_user_id: profile.id }
    );

    if (error) throw error;

    activePeer = profile;
    activeConversationId = conversationId;
    knownMessageIds = new Set();

    $("#chat-display-name").textContent = profile.display_name;
    $("#chat-username").textContent = "@" + profile.username;
    $("#chat-avatar").textContent = getInitial(profile.display_name);

    emptyChat.classList.add("hidden");
    activeChat.classList.remove("hidden");
    chatView.classList.add("mobile-chat");

    await loadMessages();
    subscribeToMessages();
  } catch (error) {
    console.error("Open chat error:", error);
    notify(
      "گفت‌وگو باز نشد. پذیرش درخواست و نام آرگومان تابع دیتابیس را بررسی کن."
    );
  }
}

/* ---------- بارگذاری پیام‌ها ---------- */

async function loadMessages() {
  if (!activeConversationId) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Messages error:", error);
    notify("پیام‌ها بارگذاری نشدند.");
    return;
  }

  messagesBox.replaceChildren();
  knownMessageIds = new Set();

  for (const message of data || []) {
    knownMessageIds.add(message.id);
    renderMessage(message);
  }

  scrollMessagesToBottom();
}

/* ---------- نمایش پیام ---------- */

function renderMessage(message) {
  if (knownMessageIds.has(message.id) && messagesBox.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) {
    return;
  }

  knownMessageIds.add(message.id);

  const node = document.createElement("article");
  node.className = "message" +
    (message.sender_id === currentUser.id ? " mine" : "");
  node.dataset.messageId = message.id;

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = message.body;

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = formatTime(message.created_at);

  node.append(body, time);
  messagesBox.appendChild(node);
}

/* ---------- دریافت زندهٔ پیام‌ها ---------- */

function subscribeToMessages() {
  if (messageSubscription) {
    supabaseClient.removeChannel(messageSubscription);
    messageSubscription = null;
  }

  if (!activeConversationId) return;

  messageSubscription = supabaseClient
    .channel("novachat-messages-" + activeConversationId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + activeConversationId
      },
      (payload) => {
        if (payload.new.conversation_id !== activeConversationId) return;
        renderMessage(payload.new);
        scrollMessagesToBottom();
      }
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Realtime status:", status);
      }
    });
}

/* ---------- ارسال پیام ---------- */

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || !activeConversationId) {
    notify("ابتدا یک گفت‌وگو انتخاب کن.");
    return;
  }

  const body = messageInput.value.trim();

  if (!body) return;

  if (body.length > 5000) {
    notify("حداکثر طول پیام ۵۰۰۰ کاراکتر است.");
    return;
  }

  const sendButton = messageForm.querySelector("button[type='submit']");
  sendButton.disabled = true;

  try {
    const { error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: activeConversationId,
        sender_id: currentUser.id,
        body
      });

    if (error) throw error;

    messageInput.value = "";
    messageInput.focus();
  } catch (error) {
    console.error("Send message error:", error);
    notify("پیام ارسال نشد؛ اتصال و دسترسی‌های دیتابیس را بررسی کن.");
  } finally {
    sendButton.disabled = false;
  }
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

function scrollMessagesToBottom() {
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

/* ---------- ناوبری موبایل ---------- */

$("#mobile-menu-btn").addEventListener("click", () => {
  chatView.classList.remove("mobile-chat");
});

$("#back-sidebar-btn").addEventListener("click", () => {
  chatView.classList.remove("mobile-chat");
});

/* ---------- تم روشن و تاریک ---------- */

$("#theme-btn").addEventListener("click", () => {
  document.body.classList.toggle("light");

  const lightMode = document.body.classList.contains("light");
  $("#theme-btn").textContent = lightMode ? "☾" : "☼";

  try {
    localStorage.setItem("novachat-theme", lightMode ? "light" : "dark");
  } catch {
    // سایت حتی در صورت نبود دسترسی localStorage هم کار می‌کند.
  }
});

try {
  if (localStorage.getItem("novachat-theme") === "light") {
    document.body.classList.add("light");
    $("#theme-btn").textContent = "☾";
  }
} catch {
  // بدون تغییر تم ذخیره‌شده ادامه می‌دهیم.
}

/* ---------- راه‌اندازی و بازیابی نشست ---------- */

async function initializeNovaChat() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    return;
  }

  if (data.session?.user) {
    await loadApplication(data.session.user);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;
      activePeer = null;
      activeConversationId = null;

      authView.classList.remove("hidden");
      chatView.classList.add("hidden");

      if (messageSubscription) {
        supabaseClient.removeChannel(messageSubscription);
        messageSubscription = null;
      }
    }
  });
}

initializeNovaChat();