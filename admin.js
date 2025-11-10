import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    doc,
    updateDoc,
    getDoc,
    deleteDoc // <-- Added deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1 FIREBASE CONFIG---
const firebaseConfig = {
  apiKey: "AIzaSyCDt202hKKUGw-U7ZGc5Gyhv8G2ZUZqK-M",
  authDomain: "myresturant-github.firebaseapp.com",
  projectId: "myresturant-github",
  storageBucket: "myresturant-github.firebasestorage.app",
  messagingSenderId: "891873428697",
  appId: "1:891873428697:web:cbd8e2a4fb7b9d9a5aeac8",
};

// Use injected config if available
const finalConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- 2. Initialize Firebase ---
const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3. Collection References ---
let menuItemsCol, ordersCol, profileDocRef;

// --- 4. App State ---
let currentEditId = null;
let currentOrdersUnsubscribe = null; // To manage the listener

// --- 5. Get ALL Elements ---
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');
const loginTabBtn = document.getElementById('login-tab-btn');
const registerTabBtn = document.getElementById('register-tab-btn');

// (Dashboard elements)
const addDishButton = document.getElementById('add-dish-btn');
const foodContainer = document.getElementById('food-container');
const logoutButton = document.getElementById('logout-btn');
const menuDashboardView = document.getElementById('menu-dashboard-view');
const ordersDashboardView = document.getElementById('orders-dashboard-view');
const showMenuBtn = document.getElementById('show-menu-btn');

// New Order Tab Elements
const pendingOrdersTab = document.getElementById('pending-orders-tab');
const completedOrdersTab = document.getElementById('completed-orders-tab');
const pendingOrdersContainer = document.getElementById('pending-orders-container');
const completedOrdersContainer = document.getElementById('completed-orders-container');
const ordersContainerPending = document.getElementById('orders-container-pending');
const ordersContainerCompleted = document.getElementById('orders-container-completed');

const dishModal = document.getElementById('dish-modal');
const closeDishModalBtn = document.getElementById('close-dish-modal');
const dishForm = document.getElementById('dish-form');
const dishModalTitle = document.getElementById('dish-modal-title');
const dishFormSubmitBtn = document.getElementById('dish-form-submit-btn');
const profileDashboardView = document.getElementById('profile-dashboard-view');
const profileForm = document.getElementById('profile-form');

let profileRestaurantName, profileEmail; // Defined in initializeDashboardLogic

const profileSaveBtn = document.getElementById('profile-save-btn');
const profileQrCanvas = document.getElementById('profile-qr-canvas'); // Still needed for profile page
const profileCustomerUrl = document.getElementById('profile-customer-url'); // Still needed for profile page
const headerOrderBtn = document.getElementById('header-order-btn');
const menuToggleBtn = document.getElementById('menu-toggle-btn'); // Now inside sidebar
const sidebarMenu = document.querySelector('.sidebar_menu');
const sidebarTitle = document.getElementById('sidebar-title'); // Get sidebar title element
const orderNotificationBadge = document.getElementById('order-notification-badge'); // Get badge element
const bavarchiLogo = document.getElementById('bavarchi'); // Get header logo
const searchInput = document.getElementById('insearch'); // Get search input

// New Customer + Stats Elements
const showCustomersBtn = document.getElementById('show-customers-btn');
const customersDashboardView = document.getElementById('customers-dashboard-view');
const customersListContainer = document.getElementById('customers-list-container');


// --- 6. Main Auth Controller (View Switcher) ---
onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        // Detach previous listener if exists
        if (currentOrdersUnsubscribe) {
            console.log("Detaching previous order listener.");
            currentOrdersUnsubscribe();
            currentOrdersUnsubscribe = null;
        }
        initializeDashboardLogic(user)
            .then(() => {
                loginView.style.display = 'none';
                dashboardView.style.display = 'block';
            })
            .catch((error) => {
                console.error("Dashboard initialization failed:", error);
                let friendlyError = `Login Failed. Please report this error: ${error.message}`;

                if (error.message.includes("permission-denied") || error.message.includes("PERMISSION_DENIED")) {
                    friendlyError = "Login Failed: Permission Denied. Please double-check your Firestore Security Rules.";
                } else if (error.message.includes("Could not load profile")) {
                    friendlyError = `Login Failed: ${error.message.split(': ')[1]}`;
                } else if (error.message.includes("firestore/unavailable")) {
                    friendlyError = "Login Failed: Cannot connect to Firestore. Please check your internet connection.";
                } else if (error.message.includes("null (setting 'value')")) {
                    friendlyError = "Login Failed: App error. Cannot find profile form elements. Please reload.";
                }

                showError(friendlyError);
                signOut(auth); // Log out on init error
                loginView.style.display = 'flex';
                dashboardView.style.display = 'none';
            });

    } else if (user && !user.emailVerified) {
        showError("Your email is not verified. Please check your inbox.");
        signOut(auth);
        loginView.style.display = 'flex';
        dashboardView.style.display = 'none';
    } else {
        // User logged out or never logged in
        if (currentOrdersUnsubscribe) {
            console.log("User logged out, detaching order listener.");
            currentOrdersUnsubscribe();
            currentOrdersUnsubscribe = null;
        }
        loginView.style.display = 'flex';
        dashboardView.style.display = 'none';
    }
});

// --- 7. Login/Register Form Logic ---
loginTabBtn.addEventListener('click', () => showForm('login'));
registerTabBtn.addEventListener('click', () => showForm('register'));
loginForm.addEventListener('submit', (e) => {
    e.preventDefault(); showError(''); showSuccess('');
    signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value)
        .catch((error) => {
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                showError("Invalid email or password.");
            } else { showError(error.message); }
        });
});
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault(); showError(''); showSuccess('');
    const email = registerEmail.value; const password = registerPassword.value;
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);

        const profileDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'admin_profiles', userCredential.user.uid);

        await setDoc(profileDocRef, {
            email: userCredential.user.email,
            restaurantName: userCredential.user.email.split('@')[0]
        });
        await signOut(auth);
        showSuccess("Registration successful! A verification link has been sent to your email. Please verify your account, then log in.");
    } catch (error) {
        console.error("Registration error:", error);
        showError(error.message);
    }
});

function showForm(formName) {
    loginForm.classList.toggle('active', formName === 'login');
    registerForm.classList.toggle('active', formName === 'register');
    loginTabBtn.classList.toggle('active', formName === 'login');
    registerTabBtn.classList.toggle('active', formName === 'register');
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');
}
function showError(message) {
    if (!message) { errorMessage.classList.add('hidden'); return; }
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    successMessage.classList.add('hidden');
}
function showSuccess(message) {
    if (!message) { successMessage.classList.add('hidden'); return; }
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
    errorMessage.classList.add('hidden');
}


// --- 8. Dashboard Logic (runs only when logged in) ---
async function initializeDashboardLogic(user) {
    console.log('Admin is logged in:', user.email, user.uid);

    profileRestaurantName = document.getElementById('profile-restaurant-name');
    profileEmail = document.getElementById('profile-email');

    if (!profileRestaurantName || !profileEmail) {
        throw new Error("Cannot set properties of null (setting 'value') - Profile elements not found in DOM.");
    }

    const menuItemsColPath = `artifacts/${appId}/admins/${user.uid}/menuItems`;
    const ordersColPath = `artifacts/${appId}/admins/${user.uid}/orders`;
    profileDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'admin_profiles', user.uid);

    menuItemsCol = collection(db, menuItemsColPath);
    ordersCol = collection(db, ordersColPath);

    // Update views and buttons arrays
    const views = [profileDashboardView, menuDashboardView, ordersDashboardView, customersDashboardView];
    const buttons = [showMenuBtn, showCustomersBtn];

    function switchView(viewToShow, btnToActivate) { // Removed title parameter
        views.forEach(v => v.classList.remove('active'));
        // Check if buttons array is valid before iterating
        if (buttons && buttons.length > 0) {
            buttons.forEach(b => b && b.classList.remove('active')); // Add check for null button
        }
        viewToShow.classList.add('active');
        // Check if btnToActivate is valid before adding class
        if (btnToActivate) {
            btnToActivate.classList.add('active');
        }
        // Trigger search after switching view to filter initial content if search bar has value
        handleSearch();
    }

    // --- Attach ALL event listeners ---
    // Profile link moved to logo
    bavarchiLogo.onclick = (e) => { e.preventDefault(); switchView(profileDashboardView, null); }; // No active button in sidebar

    showMenuBtn.onclick = (e) => { e.preventDefault(); switchView(menuDashboardView, showMenuBtn); };

    // "headerOrderBtn" now passes 'null' as the button to activate
    headerOrderBtn.onclick = (e) => { e.preventDefault(); switchView(ordersDashboardView, null); };

    // New Listeners
    showCustomersBtn.onclick = (e) => { e.preventDefault(); switchView(customersDashboardView, showCustomersBtn); };

    // Toggle Button Listener (Moved Button)
    menuToggleBtn.onclick = (e) => {
        e.preventDefault();
        sidebarMenu.classList.toggle('collapsed');
        // Adjust main content margin based on new state
        const mainContent = document.querySelector('.main-content');
        if (sidebarMenu.classList.contains('collapsed')) {
            mainContent.style.marginLeft = '80px'; // New collapsed width
            mainContent.style.width = 'calc(100% - 80px)';
            // Change icon to menu open
            menuToggleBtn.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        } else {
            mainContent.style.marginLeft = '250px';
            mainContent.style.width = 'calc(100% - 250px)';
            // Change icon to menu close
            menuToggleBtn.innerHTML = '<i class="ri-arrow-left-s-line"></i>';
        }
    };
    // Set initial toggle icon
    if (sidebarMenu.classList.contains('collapsed')) {
        menuToggleBtn.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
    } else {
        menuToggleBtn.innerHTML = '<i class="ri-arrow-left-s-line"></i>';
    }


    // New Order Tab Listeners
    pendingOrdersTab.onclick = () => {
        pendingOrdersTab.classList.add('active');
        completedOrdersTab.classList.remove('active');
        pendingOrdersContainer.classList.add('active');
        completedOrdersContainer.classList.remove('active');
        handleSearch(); // Re-apply search on tab switch
    };
    completedOrdersTab.onclick = () => {
        completedOrdersTab.classList.add('active');
        pendingOrdersTab.classList.remove('active');
        completedOrdersContainer.classList.add('active');
        pendingOrdersContainer.classList.remove('active');
        handleSearch(); // Re-apply search on tab switch
    };

    // --- Search Input Listener ---
    searchInput.addEventListener('input', handleSearch);


    // Load Menu
    try {
        onSnapshot(query(menuItemsCol), (snapshot) => {
            foodContainer.innerHTML = '';
            snapshot.forEach((doc) => renderFoodItem(doc));
            handleSearch(); // Apply search after menu loads/updates
        });
    } catch (e) {
        console.error("Error attaching menu listener:", e);
    }

    // Load Orders, Calculate Total, Build Customer List, and Update Badge
    try {
        // Store the unsubscribe function globally
        currentOrdersUnsubscribe = onSnapshot(query(ordersCol), (snapshot) => {
            console.log("Order snapshot received:", snapshot.size, "docs. Clearing and redrawing lists.");

            // --- Build temporary lists ---
            const pendingElements = [];
            const completedElements = [];
            const uniqueCustomers = new Map();
            // const totalOrders = snapshot.size; // No longer needed for display
            let pendingCount = 0; // Counter for pending orders

            // totalOrdersDisplay.textContent = totalOrders; // Removed total display update

            snapshot.forEach((doc) => {
                try {
                    const order = doc.data();
                    const orderId = doc.id;

                    // Add customer to map
                    const customer = order.customer || {};
                    if (customer.phone && customer.name) {
                        uniqueCustomers.set(customer.phone, {
                            name: customer.name,
                            phone: customer.phone
                        });
                    }

                    // Generate the card element (attaches button listener)
                    const orderCardElement = renderOrder(doc);

                    // Sort element into temporary arrays AND count pending
                    if (order.status === 'pending') {
                        pendingElements.push(orderCardElement);
                        pendingCount++; // Increment pending count
                    } else {
                        completedElements.push(orderCardElement);
                    }
                } catch (e) {
                    console.error("Failed to process order doc:", doc.id, e);
                }
            });

            // Clear DOM *after* processing all docs
            ordersContainerPending.innerHTML = '';
            ordersContainerCompleted.innerHTML = '';
            customersListContainer.innerHTML = '';

            // Append elements from arrays
            pendingElements.forEach(el => ordersContainerPending.appendChild(el));
            completedElements.forEach(el => ordersContainerCompleted.appendChild(el));

            // Render Customer List
            for (const customer of uniqueCustomers.values()) {
                const row = document.createElement('tr');
                row.innerHTML = `
                        <td class="px-4 py-3">${customer.name}</td>
                        <td class="px-4 py-3">${customer.phone}</td>
                    `;
                customersListContainer.appendChild(row);
            }

            // Update Notification Badge
            if (pendingCount > 0) {
                orderNotificationBadge.textContent = pendingCount;
                orderNotificationBadge.classList.add('visible');
            } else {
                orderNotificationBadge.classList.remove('visible');
            }

            handleSearch(); // Apply search after orders load/update
            console.log("Finished processing order snapshot and updated DOM. Pending count:", pendingCount);

        }, (error) => { // Error handler for the listener itself
            console.error("Error in onSnapshot listener for orders:", error);
            showError("Error loading orders. Please check connection or Firestore rules.");
        });

    } catch (e) {
        console.error("Error setting up orders listener:", e);
        showError("Could not load orders. Check Firestore rules.");
    }


    // Load Profile Data & Sidebar Title
    try {
        const profileSnap = await getDoc(profileDocRef);
        let restaurantDisplayName = 'Admin Portal'; // Default
        if (profileSnap.exists()) {
            const data = profileSnap.data();
            profileRestaurantName.value = data.restaurantName || '';
            profileEmail.value = user.email;
            restaurantDisplayName = data.restaurantName || user.email.split('@')[0] || 'Admin Portal';
        } else {
            console.warn("No public profile found, creating one (failsafe).");
            restaurantDisplayName = user.email.split('@')[0] || 'Admin Portal';
            await setDoc(profileDocRef, {
                email: user.email,
                restaurantName: restaurantDisplayName
            });
            profileEmail.value = user.email;
            profileRestaurantName.value = restaurantDisplayName;
        }
        // Set sidebar title
        if (sidebarTitle) sidebarTitle.textContent = restaurantDisplayName;

    } catch (err) {
        console.error("Error loading profile:", err);
        if (sidebarTitle) sidebarTitle.textContent = 'Admin Portal'; // Fallback title
        throw new Error(`Could not load profile: ${err.message}`);
    }

    // Profile Save Logic
    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const newName = profileRestaurantName.value;
        profileSaveBtn.disabled = true;
        profileSaveBtn.textContent = 'Saving...';
        try {
            await updateDoc(profileDocRef, { restaurantName: newName });
            if (sidebarTitle) sidebarTitle.textContent = newName || 'Admin Portal'; // Update sidebar on save
            profileSaveBtn.textContent = 'Saved!';
        } catch (err) {
            console.error("Error saving profile:", err);
        } finally {
            setTimeout(() => {
                profileSaveBtn.textContent = 'Save Changes';
                profileSaveBtn.disabled = false;
            }, 2000);
        }
    };

    // Dish Modal listeners
    addDishButton.onclick = (e) => { e.preventDefault(); openAddModal(); };
    closeDishModalBtn.onclick = resetDishModal;
    window.onclick = (e) => {
        if (e.target == dishModal) resetDishModal();
        // QR Modal listener removed
    };

    // QR Code Logic (Only for profile page)
    generateQRCode(user.uid, profileQrCanvas, profileCustomerUrl); // Removed null argument
    // Dish Form submit
    dishForm.onsubmit = async (e) => {
        e.preventDefault();
        dishFormSubmitBtn.disabled = true;
        dishFormSubmitBtn.textContent = currentEditId ? 'Updating...' : 'Adding...';

        const data = {
            name: document.getElementById('dish-name').value,
            price: parseFloat(document.getElementById('dish-price').value),
            imageUrl: document.getElementById('dish-image').value,
            quantity: parseInt(document.getElementById('dish-quantity').value, 10)
        };

        if (isNaN(data.quantity)) { data.quantity = -1; }
        if (isNaN(data.price) || data.price < 0) {
            dishFormSubmitBtn.disabled = false;
            dishFormSubmitBtn.textContent = currentEditId ? 'Update Dish' : 'Add Dish';
            console.error("Invalid price");
            return;
        }

        try {
            if (currentEditId) {
                await updateDoc(doc(db, menuItemsColPath, currentEditId), data);
            } else {
                await addDoc(menuItemsCol, data);
            }
            resetDishModal();
        } catch (error) {
            console.error("Error saving dish: ", error);
            dishFormSubmitBtn.textContent = currentEditId ? 'Update Dish' : 'Add Dish';
        }
        dishFormSubmitBtn.disabled = false;
    };

    // Logout
    logoutButton.onclick = (e) => {
        e.preventDefault();
        // Detach listener on logout
        if (currentOrdersUnsubscribe) {
            console.log("Logging out, detaching order listener.");
            currentOrdersUnsubscribe();
            currentOrdersUnsubscribe = null;
        }
        signOut(auth).catch((error) => console.error('Sign out error', error));
    };

    // Initial setup for main content margin (adjust for new collapsed width)
    const mainContent = document.querySelector('.main-content');
    if (sidebarMenu.classList.contains('collapsed')) {
        mainContent.style.marginLeft = '80px';
        mainContent.style.width = 'calc(100% - 80px)';
    } else {
        mainContent.style.marginLeft = '250px';
        mainContent.style.width = 'calc(100% - 250px)';
    }

} // End initializeDashboardLogic

// --- 9. Render Helper Functions ---

function getQuantityText(quantity) {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty === -1) {
        return `<span class="food-quantity qty-in-stock">In Stock</span>`;
    }
    if (qty === 0) {
        return `<span class="food-quantity qty-out-of-stock">Out of Stock</span>`;
    }
    return `<span class="food-quantity qty-low-stock">${qty} left</span>`;
}

function renderFoodItem(doc) {
    const item = doc.data();
    let itemArticle = document.getElementById(doc.id);

    if (!itemArticle) {
        itemArticle = document.createElement('article');
        itemArticle.className = 'mainfoodbox';
        itemArticle.id = doc.id;
        // Add data attribute for searching
        itemArticle.setAttribute('data-search-name', item.name.toLowerCase());
        foodContainer.appendChild(itemArticle);
    } else {
        // Update data attribute if item already exists
        itemArticle.setAttribute('data-search-name', item.name.toLowerCase());
    }


    itemArticle.innerHTML = `
            <img class="food-image" src="${item.imageUrl}" alt="${item.name}" onerror="this.src='https://placehold.co/300x200/f97316/white?text=Image+Not+Found'">
            <div class="food-details">
                <h3 class="food-name">${item.name}</h3>
                <div class="food-meta">
                    <h3 class="food-price"><i class="ri-money-rupee-circle-line"></i><u>${item.price}/-</u></h3>
                    ${getQuantityText(item.quantity)}
                </div>
            </div>
        `;
    itemArticle.onclick = () => openEditModal(doc.id, item);
}

/**
 * Creates and returns an order card element, attaching necessary listeners.
 * @param {firebase.firestore.QueryDocumentSnapshot} doc - The Firestore document for the order.
 * @returns {HTMLElement} The constructed order card element.
 */
function renderOrder(doc) {
    const orderId = doc.id;
    const order = doc.data();
    const customer = order.customer || {};

    const orderCard = document.createElement('div');
    orderCard.className = 'order-card';
    orderCard.setAttribute('data-order-id', orderId); // Keep data attribute
    // Add data attributes for searching
    orderCard.setAttribute('data-search-customer', (customer.name || '').toLowerCase());
    orderCard.setAttribute('data-search-phone', (customer.phone || '').toLowerCase());
    orderCard.setAttribute('data-search-table', `table ${customer.table || ''}`.toLowerCase());


    let total = 0;
    let itemsHtml = '<ul>';
    if (order.items) {
        order.items.forEach(item => {
            total += (item.price || 0) * (item.quantity || 0);
            itemsHtml += `
                    <li>
                        <span class="item-name">${item.name || 'Unknown Item'}</span>
                        <span class="item-qty">Qty: ${item.quantity || 0}</span>
                        <span class="item-price">₹${(item.price || 0) * (item.quantity || 0)}/-</span>
                    </li>
                `;
        });
    }
    itemsHtml += `<li class="total"><span>Total</span><span>₹${total}/-</span></li></ul>`;


    // Conditional buttons
    let actionButtonHtml = '';
    if (order.status === 'pending') {
        actionButtonHtml = `<button class="complete-order-btn" data-order-id="${orderId}">Mark as Completed</button>`;
    } else if (order.status === 'completed') {
        actionButtonHtml = `<button class="delete-order-btn" data-order-id="${orderId}"><i class="ri-delete-bin-line"></i></button>`;
    }

    orderCard.innerHTML = `
             <div class="order-card-header">
                 <h3>Table ${customer.table || 'N/A'}</h3>
                 ${order.status === 'completed' ? actionButtonHtml : ''} <!-- Delete button next to title only if completed -->
             </div>
            <p><strong>Customer:</strong> ${customer.name || 'N/A'}</p>
            <p><strong>Phone:</strong> ${customer.phone || 'N/A'}</p>
            <p><strong>Status:</strong> <span style="font-weight:700; color: ${order.status === 'pending' ? '#dc2626' : '#16a34a'};">${order.status || 'pending'}</span></p>
            ${itemsHtml}
            ${order.status === 'pending' ? actionButtonHtml : ''} <!-- Complete button at bottom only if pending -->
        `;

    // --- Attach Listeners ---
    if (order.status === 'pending') {
        const completeBtn = orderCard.querySelector(`.complete-order-btn`);
        if (completeBtn) {
            completeBtn.addEventListener('click', handleCompleteOrderClick, { once: true });
        }
    } else if (order.status === 'completed') {
        const deleteBtn = orderCard.querySelector(`.delete-order-btn`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', handleDeleteOrderClick, { once: true });
        }
    }

    return orderCard;
}


//* Handles the click event for the "Mark as Completed" button.

async function handleCompleteOrderClick(event) {
    const button = event.target.closest('button'); // Ensure we get the button element
    const clickedOrderId = button.getAttribute('data-order-id');
    console.log(`[handleCompleteOrderClick] Button clicked for order: ${clickedOrderId}`);

    button.disabled = true;

    const uid = auth.currentUser?.uid;
    if (!uid) {
        console.error("[handleCompleteOrderClick] User not logged in.");
        button.disabled = false;
        button.addEventListener('click', handleCompleteOrderClick, { once: true }); // Re-attach
        return;
    }

    const orderDocRef = doc(db, 'artifacts', appId, 'admins', uid, 'orders', clickedOrderId);

    try {
        console.log("[handleCompleteOrderClick] Attempting Firestore update:", clickedOrderId);
        await updateDoc(orderDocRef, { status: "completed" });
        console.log("[handleCompleteOrderClick] Firestore update successful:", clickedOrderId);
        // onSnapshot will handle UI redraw.

    } catch (err) {
        console.error("[handleCompleteOrderClick] Error updating order:", clickedOrderId, err);
        // Re-enable button ONLY if it still exists
        const currentButton = document.querySelector(`.complete-order-btn[data-order-id="${clickedOrderId}"]`);
        if (currentButton) {
            currentButton.disabled = false;
            currentButton.addEventListener('click', handleCompleteOrderClick, { once: true }); // Re-attach
        }
    }
}


//* Handles the click event for the Delete Order button.

async function handleDeleteOrderClick(event) {
    const button = event.target.closest('button'); // Ensure we get the button element
    const clickedOrderId = button.getAttribute('data-order-id');
    console.log(`[handleDeleteOrderClick] Delete clicked for order: ${clickedOrderId}`);

    // Simple confirmation
    if (!confirm(`Are you sure you want to permanently delete this completed order?`)) {
        button.addEventListener('click', handleDeleteOrderClick, { once: true }); // Re-attach listener if cancelled
        return;
    }

    button.disabled = true;


    const uid = auth.currentUser?.uid;
    if (!uid) {
        console.error("[handleDeleteOrderClick] User not logged in.");
        button.disabled = false; // Re-enable
        button.addEventListener('click', handleDeleteOrderClick, { once: true }); // Re-attach
        return;
    }

    const orderDocRef = doc(db, 'artifacts', appId, 'admins', uid, 'orders', clickedOrderId);

    try {
        console.log("[handleDeleteOrderClick] Attempting Firestore delete:", clickedOrderId);
        await deleteDoc(orderDocRef);
        console.log("[handleDeleteOrderClick] Firestore delete successful:", clickedOrderId);
        // onSnapshot will handle UI removal.
    } catch (err) {
        console.error("[handleDeleteOrderClick] Error deleting order:", clickedOrderId, err);
        // Re-enable button on error ONLY if it still exists
        const currentButton = document.querySelector(`.delete-order-btn[data-order-id="${clickedOrderId}"]`);
        if (currentButton) {
            currentButton.disabled = false;
            currentButton.addEventListener('click', handleDeleteOrderClick, { once: true }); // Re-attach
        }
    }
}


// --- Updated Search Functionality ---
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim(); // Trim whitespace
    console.log("Searching for:", searchTerm);

    // Determine active view
    const activeMenuView = menuDashboardView.classList.contains('active');
    const activeOrdersView = ordersDashboardView.classList.contains('active');
    const activeCustomersView = customersDashboardView.classList.contains('active');

    if (activeMenuView) {
        const items = foodContainer.querySelectorAll('.mainfoodbox');
        items.forEach(item => {
            // Use data attribute for matching
            const name = item.getAttribute('data-search-name') || '';
            const isVisible = searchTerm === '' || name.includes(searchTerm);
            if (isVisible) {
                item.classList.remove('hidden-by-search');
            } else {
                item.classList.add('hidden-by-search');
            }
        });
    } else if (activeOrdersView) {
        // Filter both pending and completed lists
        const pendingItems = ordersContainerPending.querySelectorAll('.order-card');
        const completedItems = ordersContainerCompleted.querySelectorAll('.order-card');

        const filterOrderItems = (items) => {
            items.forEach(item => {
                // Use data attributes for matching
                const customerName = item.getAttribute('data-search-customer') || '';
                const customerPhone = item.getAttribute('data-search-phone') || '';
                const table = item.getAttribute('data-search-table') || '';

                const isVisible = searchTerm === '' ||
                    customerName.includes(searchTerm) ||
                    customerPhone.includes(searchTerm) ||
                    table.includes(searchTerm);

                if (isVisible) {
                    item.classList.remove('hidden-by-search');
                } else {
                    item.classList.add('hidden-by-search');
                }
            });
        };

        filterOrderItems(pendingItems);
        filterOrderItems(completedItems);

    } else if (activeCustomersView) {
        const rows = customersListContainer.querySelectorAll('tr');
        rows.forEach(row => {
            const nameCell = row.querySelector('td:nth-child(1)');
            const phoneCell = row.querySelector('td:nth-child(2)');

            const name = nameCell ? nameCell.textContent.toLowerCase() : '';
            const phone = phoneCell ? phoneCell.textContent.toLowerCase() : '';

            const isVisible = searchTerm === '' || name.includes(searchTerm) || phone.includes(searchTerm);
            if (isVisible) {
                row.classList.remove('hidden-by-search');
            } else {
                row.classList.add('hidden-by-search');
            }
        });
    }
}


// Generate QR Code only needed for Profile page
function generateQRCode(uid, canvasEl, urlEl) {
    if (!canvasEl || !urlEl) return; // Add check if elements don't exist

    const customerPageUrl = new URL(window.location.href);
    customerPageUrl.pathname = customerPageUrl.pathname.replace(/[^/]*$/, 'customer.html');
    const finalUrl = `${customerPageUrl.href}?admin_id=${uid}`;

    if (urlEl) urlEl.textContent = finalUrl; // Add check for urlEl

    if (canvasEl) { // Add check for canvasEl
        QRCode.toCanvas(canvasEl, finalUrl, { width: 300, margin: 2 }, function (error) {
            if (error) console.error("QR Code Generation Error:", error);
        });
    }
}

// --- 10. Modal Control Functions ---
function resetDishModal() {
    dishModal.style.display = 'none';
    dishForm.reset();
    document.getElementById('dish-quantity').value = -1; // Reset quantity
    currentEditId = null;
    dishModalTitle.textContent = 'Add a New Dish';
    dishFormSubmitBtn.textContent = 'Add Dish';
    dishFormSubmitBtn.style.backgroundColor = '#4CAF50';
}

function openAddModal() {
    resetDishModal();
    dishModal.style.display = 'block';
}

function openEditModal(id, item) {
    currentEditId = id;
    dishModalTitle.textContent = 'Edit Dish';
    dishFormSubmitBtn.textContent = 'Update Dish';
    dishFormSubmitBtn.style.backgroundColor = '#1e7835';
    document.getElementById('dish-name').value = item.name;
    document.getElementById('dish-price').value = item.price;
    document.getElementById('dish-image').value = item.imageUrl;
    document.getElementById('dish-quantity').value = item.quantity ?? -1; // Populate quantity
    dishModal.style.display = 'block';
}