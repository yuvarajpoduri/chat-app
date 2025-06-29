import React, { useRef, useState, useEffect } from "react";
import "./App.css";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { useAuthState } from "react-firebase-hooks/auth";
import { useCollectionData } from "react-firebase-hooks/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDAsXsHe0vGM9n5pHFdDvDyfrv53aBKHy8",
  authDomain: "hapojx.firebaseapp.com",
  projectId: "hapojx",
  storageBucket: "hapojx.firebasestorage.app",
  messagingSenderId: "313167661339",
  appId: "1:313167661339:web:e192e0471ff1c979b4abbe",
  measurementId: "G-YQ3HRQV8W9",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

// Initialize messaging only if supported
let messaging = null;
try {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    messaging = getMessaging(app);
  }
} catch (error) {
  console.log("Firebase messaging not supported:", error);
}

// Track if notification permission was already requested
let notificationPermissionRequested = false;

// Move helper functions outside of components to avoid redeclaration
const formatDateSeparator = (date) => {
  const now = new Date();
  const messageDate = new Date(date);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDateOnly = new Date(
    messageDate.getFullYear(),
    messageDate.getMonth(),
    messageDate.getDate()
  );

  if (messageDateOnly.getTime() === today.getTime()) {
    return "Today";
  } else if (messageDateOnly.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    const diffTime = today.getTime() - messageDateOnly.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return messageDate.toLocaleDateString("en-US", { weekday: "long" });
    } else {
      return messageDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }
};

const shouldShowDateSeparator = (currentMessage, previousMessage) => {
  if (
    !previousMessage ||
    !currentMessage.createdAt ||
    !previousMessage.createdAt
  ) {
    return true;
  }

  const currentDate = currentMessage.createdAt.toDate();
  const previousDate = previousMessage.createdAt.toDate();

  return currentDate.toDateString() !== previousDate.toDateString();
};

// Enhanced mobile detection and PWA functions
const isPWA = () => {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
};

const detectMobileAndSetup = () => {
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  console.log("Device info:", { isMobile, isIOS, isAndroid, isPWA: isPWA() });

  if (isIOS && !isPWA()) {
    console.log("iOS detected but not running as PWA - notifications limited");
    // Show PWA installation prompt after a delay
    setTimeout(() => {
      showPWAInstallPrompt();
    }, 5000);
  }

  return { isMobile, isIOS, isAndroid };
};

// Service Worker setup
const setupServiceWorker = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("✅ Service Worker registered:", registration);
      return registration;
    } catch (error) {
      console.error("❌ Service Worker registration failed:", error);
      return null;
    }
  }
  return null;
};

// PWA installation prompt
const showPWAInstallPrompt = () => {
  if (document.querySelector(".pwa-install-overlay")) return; // Prevent duplicates

  const modal = document.createElement("div");
  modal.className = "pwa-install-overlay";

  modal.innerHTML = `
    <div class="pwa-install-modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>📱 Install App for Best Experience</h3>
        </div>
        <div class="modal-body">
          <p>For notifications and the best mobile experience:</p>
          <ol style="text-align: left; padding-left: 20px;">
            <li>Tap the Share button (□↗) at the bottom</li>
            <li>Select "Add to Home Screen"</li>
            <li>Tap "Add" to install</li>
            <li>Open the app from your home screen</li>
          </ol>
        </div>
        <div class="modal-buttons">
          <button class="modal-button secondary" onclick="this.closest('.pwa-install-overlay').remove()">Later</button>
          <button class="modal-button primary" onclick="this.closest('.pwa-install-overlay').remove()">Got it!</button>
        </div>
      </div>
    </div>
  `;

  // Add styles if not already added
  if (!document.querySelector("#pwa-modal-styles")) {
    const styles = document.createElement("style");
    styles.id = "pwa-modal-styles";
    styles.textContent = `
      .pwa-install-overlay, .manual-instructions-overlay, .notification-permission-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        padding: 20px;
      }
      
      .pwa-install-modal, .manual-instructions-modal, .notification-permission-modal {
        background: white;
        border-radius: 12px;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      
      .modal-content {
        padding: 24px;
      }
      
      .modal-header h3 {
        margin: 0 0 16px 0;
        color: #333;
        text-align: center;
      }
      
      .modal-body {
        margin-bottom: 24px;
        color: #666;
        line-height: 1.5;
      }
      
      .modal-body ol {
        margin: 12px 0;
      }
      
      .modal-body li {
        margin: 8px 0;
      }
      
      .modal-buttons {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
      
      .modal-button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      }
      
      .modal-button.primary {
        background: #007bff;
        color: white;
      }
      
      .modal-button.primary:hover {
        background: #0056b3;
      }
      
      .modal-button.secondary {
        background: #f8f9fa;
        color: #6c757d;
        border: 1px solid #dee2e6;
      }
      
      .modal-button.secondary:hover {
        background: #e9ecef;
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(modal);
};

// Manual instructions for iOS users
const showManualInstructions = () => {
  if (document.querySelector(".manual-instructions-overlay")) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    const modal = document.createElement("div");
    modal.className = "manual-instructions-overlay";

    modal.innerHTML = `
      <div class="manual-instructions-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>📱 Enable Notifications on iOS</h3>
          </div>
          <div class="modal-body">
            <ol style="text-align: left; padding-left: 20px;">
              <li><strong>Add to Home Screen:</strong> Tap the Share button (□↗) and select "Add to Home Screen"</li>
              <li><strong>Open from Home Screen:</strong> Use the app icon, not Safari</li>
              <li><strong>Enable in Settings:</strong> Go to Settings > Safari > Advanced > Experimental Features > Turn on "Notifications"</li>
            </ol>
            <p><small>Note: iOS notifications only work in PWA mode (installed to home screen)</small></p>
          </div>
          <div class="modal-buttons">
            <button class="modal-button primary" onclick="this.closest('.manual-instructions-overlay').remove()">Got it!</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }
};

// Show notification permission modal
const showNotificationPermissionModal = () => {
  return new Promise((resolve) => {
    if (document.querySelector(".notification-permission-overlay")) {
      resolve(false);
      return;
    }

    const modal = document.createElement("div");
    modal.className = "notification-permission-overlay";

    modal.innerHTML = `
      <div class="notification-permission-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>🔔 Stay Connected</h3>
          </div>
          <div class="modal-body">
            <p>Get notified when someone sends a message, even when you're not actively using the app.</p>
            <p><strong>We'll only send notifications for new messages.</strong></p>
          </div>
          <div class="modal-buttons">
            <button class="modal-button secondary" onclick="this.closest('.notification-permission-overlay').remove(); window.notificationModalResolve(false);">Not Now</button>
            <button class="modal-button primary" onclick="this.closest('.notification-permission-overlay').remove(); window.notificationModalResolve(true);">Enable Notifications</button>
          </div>
        </div>
      </div>
    `;

    // Store resolve function globally
    window.notificationModalResolve = resolve;

    document.body.appendChild(modal);
  });
};

// Enhanced notification permission function
const requestNotificationPermission = async () => {
  try {
    if (notificationPermissionRequested) {
      console.log("Notification permission already requested this session");
      return;
    }

    notificationPermissionRequested = true;

    if (!("Notification" in window)) {
      console.log("❌ This browser does not support notifications");
      return;
    }

    if (!auth.currentUser) {
      console.log("User not authenticated, skipping notification setup");
      return;
    }

    // Set up service worker first
    const registration = await setupServiceWorker();
    if (!registration) {
      console.log("❌ Service Worker setup failed");
    }

    console.log("Current notification permission:", Notification.permission);

    if (Notification.permission === "granted") {
      console.log("✅ Notifications already granted");
      showTestNotification();
      return;
    }

    if (Notification.permission === "denied") {
      console.log("❌ Notifications permanently denied");
      showManualInstructions();
      return;
    }

    // Show custom modal for better mobile UX
    const userWantsNotifications = await showNotificationPermissionModal();

    if (!userWantsNotifications) {
      console.log("User declined notifications");
      return;
    }

    console.log("📱 Requesting notification permission...");

    let permission;
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      permission = await new Promise((resolve) => {
        Notification.requestPermission(resolve);
      });
    }

    console.log("📱 Notification permission result:", permission);

    if (permission === "granted") {
      console.log("✅ Notification permission granted!");
      showTestNotification();

      // Set up FCM token if available
      if (messaging && registration) {
        try {
          // You'll need to replace 'YOUR_VAPID_KEY' with your actual VAPID key
          // const token = await getToken(messaging, {
          //   vapidKey: 'YOUR_VAPID_KEY',
          //   serviceWorkerRegistration: registration
          // });
          // console.log('FCM Token:', token);
          // Save token to your backend
        } catch (tokenError) {
          console.log("FCM token error:", tokenError);
        }
      }
    } else if (permission === "denied") {
      console.log("❌ Notification permission denied");
      showManualInstructions();
    } else {
      console.log("⏸️ Notification permission dismissed");
    }
  } catch (error) {
    console.error("❌ Error requesting notification permission:", error);
  }
};

const showTestNotification = () => {
  if (Notification.permission === "granted") {
    try {
      const testNotification = new Notification("🎉 Notifications Ready!", {
        body: "You'll now receive chat notifications",
        icon: "/favicon.ico",
        tag: "test-notification",
        requireInteraction: false,
        silent: false,
      });

      setTimeout(() => {
        if (testNotification) {
          testNotification.close();
        }
      }, 3000);

      console.log("✅ Test notification sent");
    } catch (error) {
      console.error("❌ Test notification failed:", error);
    }
  }
};

const setupForegroundNotifications = () => {
  if (!messaging) {
    console.log("📱 FCM not available, using basic notifications only");
    return;
  }

  try {
    onMessage(messaging, (payload) => {
      console.log("📨 FCM message received:", payload);

      const { title, body } = payload.notification || {};

      if (Notification.permission === "granted") {
        new Notification(title || "New Message", {
          body: body || "You have a new message",
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "chat-message",
          requireInteraction: false,
          silent: false,
        });
      }
    });
  } catch (error) {
    console.error("❌ Error setting up FCM notifications:", error);
  }
};

const sendNotification = async (messageData) => {
  console.log("📨 Attempting to send mobile notification for:", messageData);

  // Only send notification if it's not from the current user
  if (messageData.uid === auth.currentUser?.uid) {
    console.log("🚫 Not sending notification for own message");
    return;
  }

  // Check if notifications are supported and permitted
  if (!("Notification" in window)) {
    console.log("❌ Notifications not supported");
    showInAppNotification(messageData);
    return;
  }

  if (Notification.permission !== "granted") {
    console.log("❌ Notification permission not granted");
    showInAppNotification(messageData);
    return;
  }

  try {
    const notification = new Notification(`💬 ${messageData.displayName}`, {
      body:
        messageData.text.length > 100
          ? messageData.text.substring(0, 100) + "..."
          : messageData.text,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "chat-message",
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200],
      data: {
        messageId: messageData.id,
        timestamp: Date.now(),
        sender: messageData.displayName,
      },
    });

    setTimeout(() => {
      if (notification) {
        notification.close();
      }
    }, 6000);

    notification.onclick = function (event) {
      console.log("📱 Notification clicked");
      if (window.focus) {
        window.focus();
      }
      setTimeout(() => {
        const dummy = document.querySelector(".scroll-anchor");
        if (dummy) {
          dummy.scrollIntoView({ behavior: "smooth" });
        }
      }, 100);
      this.close();
    };

    notification.onerror = function (event) {
      console.error("❌ Notification error:", event);
      showInAppNotification(messageData);
    };

    console.log("✅ Mobile notification sent successfully");

    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (error) {
    console.error("❌ Error showing mobile notification:", error);
    showInAppNotification(messageData);
  }
};

const showInAppNotification = (messageData) => {
  console.log("📱 Showing in-app notification fallback");

  const toast = document.createElement("div");
  toast.className = "in-app-notification";
  toast.innerHTML = `
    <div class="notification-content">
      <div class="notification-avatar">${messageData.displayName[0].toUpperCase()}</div>
      <div class="notification-text">
        <div class="notification-sender">${messageData.displayName}</div>
        <div class="notification-message">${
          messageData.text.length > 50
            ? messageData.text.substring(0, 50) + "..."
            : messageData.text
        }</div>
      </div>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  if (!document.querySelector("#in-app-notification-styles")) {
    const styles = document.createElement("style");
    styles.id = "in-app-notification-styles";
    styles.textContent = `
      .in-app-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
      }
      
      .notification-content {
        display: flex;
        align-items: center;
        padding: 12px;
      }
      
      .notification-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #007bff;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        margin-right: 10px;
      }
      
      .notification-text {
        flex: 1;
      }
      
      .notification-sender {
        font-weight: bold;
        font-size: 14px;
        margin-bottom: 2px;
      }
      
      .notification-message {
        font-size: 13px;
        color: #666;
      }
      
      .notification-close {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #999;
        margin-left: 10px;
      }
      
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      
      @media (max-width: 480px) {
        .in-app-notification {
          right: 10px;
          left: 10px;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 5000);

  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
};

const clearExistingNotifications = () => {
  const inAppNotifications = document.querySelectorAll(".in-app-notification");
  inAppNotifications.forEach((notification) => notification.remove());
};

// Visibility change handler
let wasHidden = false;
const handleVisibilityChange = () => {
  if (document.hidden) {
    wasHidden = true;
    console.log("📱 App went to background");
  } else if (wasHidden) {
    wasHidden = false;
    console.log("📱 App came to foreground");
    clearExistingNotifications();
  }
};

// Add event listener for visibility change
document.addEventListener("visibilitychange", handleVisibilityChange);

function App() {
  const [user] = useAuthState(auth);

  useEffect(() => {
    const deviceInfo = detectMobileAndSetup();

    if (user) {
      // Delay notification setup for mobile
      const delay = deviceInfo.isMobile ? 3000 : 1000;

      setTimeout(() => {
        requestNotificationPermission();
      }, delay);

      setupForegroundNotifications();

      const handleAppResume = () => {
        console.log("📱 App resumed");
        clearExistingNotifications();
      };

      const handleAppPause = () => {
        console.log("📱 App paused");
      };

      window.addEventListener("focus", handleAppResume);
      window.addEventListener("blur", handleAppPause);

      return () => {
        window.removeEventListener("focus", handleAppResume);
        window.removeEventListener("blur", handleAppPause);
      };
    }
  }, [user]);

  return (
    <div className="App">
      <header className="header">
        <div className="header-content">
          <h1 className="app-title">Poduri's</h1>
          <SignOut />
        </div>
      </header>
      <section className="main-section">
        {user ? <ChatRoom /> : <SignIn />}
      </section>
    </div>
  );
}

function SignIn() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const register = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      await updateProfile(userCredential.user, { displayName: name });
      alert("✅ Registered successfully!");
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert("❌ " + err.message);
    }
  };

  return (
    <div className="signin-container">
      <div className="signin-card">
        <div className="signin-header">
          <h1 className="signin-title">
            {isLogin ? "Welcome Back!" : "Join Us! 🚀"}
          </h1>
          <p className="signin-subtitle">
            {isLogin
              ? "Sign in to continue chatting"
              : "Create your account to start"}
          </p>
        </div>

        <div className="signin-form">
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Display Name</label>
              <input
                className="signin-input"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                type="text"
              />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className="signin-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className="signin-input"
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            className="signin-button primary"
            onClick={isLogin ? login : register}
          >
            {isLogin ? "Sign In" : "Create Account 🎉"}
          </button>

          <button
            className="signin-button secondary"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SignOut() {
  return (
    auth.currentUser && (
      <button className="signout-button" onClick={() => signOut(auth)}>
        Sign Out
      </button>
    )
  );
}

function ChatRoom() {
  const dummy = useRef();
  const chatContainer = useRef();
  const messagesRef = collection(firestore, "messages");
  const q = query(messagesRef, orderBy("createdAt"), limit(10000));
  const [messages] = useCollectionData(q, { idField: "id" });
  const [formValue, setFormValue] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = () => {
    if (chatContainer.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainer.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  };

  const scrollToBottom = () => {
    dummy.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages && dummy.current) {
      const timer = setTimeout(() => {
        scrollToBottom();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!formValue.trim()) {
      console.log("Empty message, not sending");
      return;
    }

    if (!auth.currentUser) {
      console.log("No authenticated user");
      return;
    }

    const { uid, displayName } = auth.currentUser;

    try {
      const messageData = {
        text: formValue.trim(),
        createdAt: serverTimestamp(),
        uid,
        displayName: displayName || "Anonymous",
      };

      console.log("Sending message:", messageData);

      const docRef = await addDoc(messagesRef, messageData);
      console.log("✅ Message sent successfully with ID:", docRef.id);

      setFormValue("");
      setTimeout(() => scrollToBottom(), 100);

      const notificationData = {
        ...messageData,
        id: docRef.id,
        timestamp: new Date(),
      };

      setTimeout(() => {
        sendNotification(notificationData);
      }, 500);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  return (
    <div className="chatroom-container">
      <main
        className="messages-container"
        ref={chatContainer}
        onScroll={handleScroll}
      >
        <div className="messages-list">
          {messages &&
            messages.map((msg, index) => {
              const showDateSeparator = shouldShowDateSeparator(
                msg,
                messages[index - 1]
              );

              return (
                <React.Fragment key={`message-${msg.id}-${index}`}>
                  {showDateSeparator && msg.createdAt && (
                    <div
                      key={`date-${msg.id}-${index}`}
                      className="date-separator"
                    >
                      <span className="date-separator-text">
                        {formatDateSeparator(msg.createdAt.toDate())}
                      </span>
                    </div>
                  )}
                  <ChatMessage key={`chat-${msg.id}`} message={msg} />
                </React.Fragment>
              );
            })}
          <div ref={dummy} className="scroll-anchor"></div>
        </div>
      </main>

      {showScrollButton && (
        <button className="scroll-to-bottom" onClick={scrollToBottom}>
          <span className="scroll-icon">⬇️</span>
        </button>
      )}

      <form className="message-form" onSubmit={sendMessage}>
        <div className="input-container">
          <input
            className="message-input"
            value={formValue}
            onChange={(e) => setFormValue(e.target.value)}
            placeholder="Type a message..."
            maxLength={1000}
          />
          <button
            type="submit"
            className={`send-button ${formValue.trim() ? "active" : ""}`}
            disabled={!formValue.trim()}
          >
            <span className="send-icon">🚀</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function ChatMessage(props) {
  const { text, uid, displayName, createdAt } = props.message;
  const messageClass = uid === auth.currentUser.uid ? "sent" : "received";

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <div className={`message ${messageClass}`}>
      <div className="message-content">
        {messageClass === "received" && (
          <div className="message-sender">{displayName}</div>
        )}
        <div className="message-bubble">
          <p className="message-text">{text}</p>
          <div className="message-time">{formatTime(createdAt)}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
