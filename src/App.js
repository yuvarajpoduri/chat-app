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

// Track user interactions for vibration API
let userHasInteracted = false;
let notificationPermissionRequested = false;

// Track user interactions
const trackUserInteraction = () => {
  if (!userHasInteracted) {
    userHasInteracted = true;
    console.log("✅ User interaction detected - vibration now available");
  }
};

// Safe vibration function with user interaction check
const safeVibrate = (pattern) => {
  if ("vibrate" in navigator && userHasInteracted) {
    try {
      navigator.vibrate(pattern);
      console.log("📱 Vibration triggered");
    } catch (error) {
      console.log("❌ Vibration failed:", error);
    }
  } else if ("vibrate" in navigator && !userHasInteracted) {
    console.log("⚠️ Vibration blocked - user hasn't interacted yet");
  } else {
    console.log("❌ Vibration not supported");
  }
};

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

// Custom notification permission modal
const showNotificationPermissionModal = () => {
  return new Promise((resolve) => {
    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.className = "notification-permission-overlay";

    // Create modal
    const modal = document.createElement("div");
    modal.className = "notification-permission-modal";

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🔔 Enable Notifications</h3>
        </div>
        <div class="modal-body">
          <p>Get notified when you receive new messages, even when the app is in the background.</p>
          <p>This helps you stay connected with your conversations!</p>
        </div>
        <div class="modal-buttons">
          <button class="modal-button secondary" data-action="deny">Not Now</button>
          <button class="modal-button primary" data-action="allow">Enable Notifications</button>
        </div>
      </div>
    `;

    // Add styles if not already added
    if (!document.querySelector("#notification-modal-styles")) {
      const styles = document.createElement("style");
      styles.id = "notification-modal-styles";
      styles.textContent = `
        .notification-permission-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }
        
        .notification-permission-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          max-width: 400px;
          width: 100%;
          animation: modalSlideIn 0.3s ease-out;
        }
        
        .modal-content {
          padding: 24px;
        }
        
        .modal-header h3 {
          margin: 0 0 16px 0;
          color: #333;
          font-size: 18px;
          text-align: center;
        }
        
        .modal-body p {
          margin: 0 0 12px 0;
          color: #666;
          line-height: 1.4;
          text-align: center;
        }
        
        .modal-buttons {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }
        
        .modal-button {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
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
          color: #666;
          border: 1px solid #dee2e6;
        }
        
        .modal-button.secondary:hover {
          background: #e9ecef;
        }
        
        @keyframes modalSlideIn {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @media (max-width: 480px) {
          .notification-permission-overlay {
            padding: 16px;
          }
          
          .modal-content {
            padding: 20px;
          }
          
          .modal-buttons {
            flex-direction: column;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    // Add event listeners
    const handleClick = (e) => {
      const action = e.target.dataset.action;
      if (action) {
        document.body.removeChild(overlay);
        resolve(action === "allow");
      }
    };

    modal.addEventListener("click", handleClick);

    // Add to DOM
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Handle outside click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });
  });
};

// Notification functions moved outside component
const requestNotificationPermission = async () => {
  try {
    // Only ask once per session
    if (notificationPermissionRequested) {
      console.log("Notification permission already requested this session");
      return;
    }

    notificationPermissionRequested = true;

    if (!("Notification" in window)) {
      console.log("❌ This browser does not support notifications");
      return;
    }

    // Check if user is authenticated before requesting permission
    if (!auth.currentUser) {
      console.log("User not authenticated, skipping notification setup");
      return;
    }

    // Check current permission status
    console.log("Current notification permission:", Notification.permission);

    if (Notification.permission === "granted") {
      console.log("✅ Notifications already granted");
      showTestNotification();
      return;
    }

    if (Notification.permission === "denied") {
      console.log("❌ Notifications permanently denied");
      return;
    }

    // Show custom modal instead of browser confirm
    const userWantsNotifications = await showNotificationPermissionModal();

    if (!userWantsNotifications) {
      console.log("User declined notifications");
      return;
    }

    // Request permission
    console.log("📱 Requesting notification permission...");

    let permission;
    try {
      permission = await Notification.requestPermission();
    } catch (error) {
      // Fallback for older browsers
      permission = await new Promise((resolve) => {
        Notification.requestPermission(resolve);
      });
    }

    console.log("📱 Notification permission result:", permission);

    if (permission === "granted") {
      console.log("✅ Notification permission granted!");
      showTestNotification();
    } else if (permission === "denied") {
      console.log("❌ Notification permission denied");
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
        body: "You'll receive alerts when you get new messages",
        icon: window.location.origin + "/favicon.ico",
        tag: "test-notification",
        requireInteraction: false,
        silent: false,
        data: {
          type: "test",
        },
      });

      // Add click handler for test notification
      testNotification.onclick = function () {
        console.log("Test notification clicked");
        if (window.focus) {
          window.focus();
        }
        this.close();
      };

      // Auto-close after 4 seconds
      setTimeout(() => {
        if (testNotification) {
          testNotification.close();
        }
      }, 4000);

      console.log("✅ Test notification displayed");

      // Use safe vibration function
      safeVibrate([100, 50, 100]);
    } catch (error) {
      console.error("❌ Test notification failed:", error);
    }
  } else {
    console.log("❌ Cannot show test notification - permission not granted");
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
  console.log("📨 Attempting to send notification for:", messageData);

  // Only send notification if it's not from the current user
  if (messageData.uid === auth.currentUser?.uid) {
    console.log("🚫 Not sending notification for own message");
    return;
  }

  // Check if app is in background (only send notifications when app is not visible)
  if (!document.hidden) {
    console.log("📱 App is active, skipping notification");
    return;
  }

  console.log("📱 App is in background, sending notification");

  // Check if notifications are supported and permitted
  if (!("Notification" in window)) {
    console.log("❌ Notifications not supported, showing in-app fallback");
    showInAppNotification(messageData);
    return;
  }

  if (Notification.permission !== "granted") {
    console.log(
      "❌ Notification permission not granted, showing in-app fallback"
    );
    showInAppNotification(messageData);
    return;
  }

  try {
    // Enhanced notification options for better mobile support
    const notificationOptions = {
      body:
        messageData.text.length > 100
          ? messageData.text.substring(0, 100) + "..."
          : messageData.text,
      icon: window.location.origin + "/favicon.ico",
      badge: window.location.origin + "/favicon.ico",
      tag: "chat-message-" + messageData.id,
      requireInteraction: true,
      silent: false,
      data: {
        messageId: messageData.id,
        timestamp: Date.now(),
        sender: messageData.displayName,
        url: window.location.href,
      },
    };

    // Use safe vibration function
    safeVibrate([200, 100, 200]);

    const notification = new Notification(
      `💬 ${messageData.displayName}`,
      notificationOptions
    );

    // Handle notification click
    notification.onclick = function (event) {
      console.log("📱 Notification clicked");
      event.preventDefault();

      // Focus the window
      if (window.focus) {
        window.focus();
      }

      // Bring app to foreground
      if (window.parent && window.parent.focus) {
        window.parent.focus();
      }

      // Scroll to bottom of chat
      setTimeout(() => {
        const dummy = document.querySelector(".scroll-anchor");
        if (dummy) {
          dummy.scrollIntoView({ behavior: "smooth" });
        }
      }, 200);

      this.close();
    };

    // Handle notification error
    notification.onerror = function (event) {
      console.error("❌ Notification error:", event);
      showInAppNotification(messageData);
    };

    // Auto-close after 10 seconds (longer for mobile)
    setTimeout(() => {
      if (notification) {
        notification.close();
      }
    }, 10000);

    console.log("✅ Push notification sent successfully");
  } catch (error) {
    console.error("❌ Error showing push notification:", error);
    // Always show in-app notification as fallback
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

  // Use safe vibration function
  safeVibrate([200, 100, 200]);
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
    // Track user interactions for vibration API
    const events = ["click", "touchstart", "keydown", "mousedown"];

    const handleInteraction = () => {
      trackUserInteraction();
      // Remove listeners after first interaction
      events.forEach((event) => {
        document.removeEventListener(event, handleInteraction);
      });
    };

    events.forEach((event) => {
      document.addEventListener(event, handleInteraction, { once: true });
    });

    if (user) {
      // Request notification permission only once when user logs in
      setTimeout(() => {
        requestNotificationPermission();
      }, 1000); // Small delay to ensure user is settled

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
        events.forEach((event) => {
          document.removeEventListener(event, handleInteraction);
        });
      };
    }

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleInteraction);
      });
    };
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
  const testNotification = () => {
    if (Notification.permission === "granted") {
      const testMsg = {
        uid: "test-user-id",
        displayName: "Test User",
        text: "This is a test notification to check if notifications work!",
        id: "test-" + Date.now(),
      };
      sendNotification(testMsg);
    } else {
      alert("🔔 Please allow notifications first!");
      requestNotificationPermission();
    }
  };

  return (
    auth.currentUser && (
      <div className="header-buttons">
        <button
          className="test-notification-button"
          onClick={testNotification}
          title="Test Notifications"
        >
          🔔
        </button>
        <button className="signout-button" onClick={() => signOut(auth)}>
          Sign Out
        </button>
      </div>
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
      }, 1000);
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

function ChatMessage({ message }) {
  const { text, uid, displayName, createdAt } = message;
  const isOwn = uid === auth.currentUser?.uid;
  const timestamp = createdAt
    ?.toDate()
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const firstLetter = displayName ? displayName[0].toUpperCase() : "?";

  return (
    <div className={`message-wrapper ${isOwn ? "own" : "other"}`}>
      {!isOwn && (
        <div className="message-avatar">
          <span className="avatar-text">{firstLetter}</span>
        </div>
      )}

      <div className={`message-bubble ${isOwn ? "own" : "other"}`}>
        <div className="message-content">
          <div className="message-header">
            {!isOwn && <span className="message-author">{displayName}</span>}
            <span className="message-time">{timestamp}</span>
          </div>
          <div className="message-text">{text}</div>
        </div>
      </div>

      {isOwn && (
        <div className="message-avatar own">
          <span className="avatar-text">{firstLetter}</span>
        </div>
      )}
    </div>
  );
}

export default App;
