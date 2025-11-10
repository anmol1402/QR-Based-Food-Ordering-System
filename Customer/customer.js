import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// Import necessary Firestore functions
import {
    getFirestore, collection, onSnapshot, query, addDoc, serverTimestamp,
    doc, getDoc, updateDoc, increment, where // <-- Added 'where' for querying
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDt202hKKUGw-U7ZGc5Gyhv8G2ZUZqK-M",
  authDomain: "myresturant-github.firebaseapp.com",
  projectId: "myresturant-github",
  storageBucket: "myresturant-github.firebasestorage.app",
  messagingSenderId: "891873428697",
  appId: "1:891873428697:web:cbd8e2a4fb7b9d9a5aeac8",
};

const finalConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- 2. Initialize Firebase ---
const app = initializeApp(finalConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 3. Collection References (Will be set based on URL) ---
let menuItemsCol, ordersCol, profileDocRef;
let adminId = null;
let menuItemsColPath = ''; // Store the path for later use
let currentCustomerOrdersUnsubscribe = null; // Listener for customer's orders

// --- 4. Get Elements ---
const infoView = document.getElementById('info-view');
const infoViewContent = document.getElementById('info-view-content');
const menuView = document.getElementById('menu-view');
const menuContainer = document.getElementById('customer-menu-container');
const cartModal = document.getElementById('cart-modal');
const cartBtn = document.getElementById('cart-btn');
const closeCartBtn = document.getElementById('close-cart-btn');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotalEl = document.getElementById('cart-total');
const cartItemCountEl = document.getElementById('cart-item-count');
const placeOrderBtn = document.getElementById('place-order-btn');
const restaurantNameMenu = document.getElementById('restaurant-name-menu');

// Profile Elements
const profileIconBtn = document.getElementById('profile-icon-btn');
const profileModal = document.getElementById('profile-modal');
const profileModalName = document.getElementById('profile-modal-name');
const profileModalPhone = document.getElementById('profile-modal-phone');
const profileModalTable = document.getElementById('profile-modal-table');
const profileLogoutBtn = document.getElementById('profile-logout-btn');

// My Orders Elements
const myOrdersBtn = document.getElementById('my-orders-btn');
const myOrdersModal = document.getElementById('my-orders-modal');
const closeMyOrdersBtn = document.getElementById('close-my-orders-btn');
const myOrdersList = document.getElementById('my-orders-list');


// --- 5. App State ---
let cart = []; // Array of { id, name, price, quantity }
let menuCache = {}; // Cache for item details { id: { name, price, quantity } }
let customerPhoneNumber = null; // Store phone number for order query

// --- 6. Main View Controller (On Page Load) ---
document.addEventListener('DOMContentLoaded', async () => {

    const urlParams = new URLSearchParams(window.location.search);
    adminId = urlParams.get('admin_id');

    if (!adminId) {
        showError("Invalid QR Code or URL. No restaurant ID found.");
        return;
    }

    sessionStorage.setItem('adminId', adminId);

    // Define dynamic paths
    profileDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'admin_profiles', adminId);
    menuItemsColPath = `artifacts/${appId}/admins/${adminId}/menuItems`;
    menuItemsCol = collection(db, menuItemsColPath);
    ordersCol = collection(db, `artifacts/${appId}/admins/${adminId}/orders`);

    const restaurantName = await loadRestaurantInfo(adminId);
    if (!restaurantName) {
        showError("Could not load restaurant details.");
        return;
    }

    const customerDetailsString = sessionStorage.getItem('customerDetails');
    if (customerDetailsString) {
        const details = JSON.parse(customerDetailsString);
        customerPhoneNumber = details.phone; // Store phone number
        showMenuView(restaurantName);
    } else {
        showInfoForm(restaurantName);
    }

    // --- Event Listeners ---
    if (profileIconBtn) profileIconBtn.addEventListener('click', toggleProfileModal);
    if (profileLogoutBtn) profileLogoutBtn.addEventListener('click', handleLogout);
    if (myOrdersBtn) myOrdersBtn.addEventListener('click', () => myOrdersModal.style.display = 'block'); // Open My Orders modal
    if (closeMyOrdersBtn) closeMyOrdersBtn.addEventListener('click', () => myOrdersModal.style.display = 'none'); // Close My Orders modal

    // Global click listeners
    document.addEventListener('click', (event) => {
        // Close profile modal
        if (profileModal && profileIconBtn && !profileModal.contains(event.target) && !profileIconBtn.contains(event.target) && profileModal.style.display === 'block') {
            profileModal.style.display = 'none';
        }
        // Close 'My Orders' modal
        if (myOrdersModal && myOrdersBtn && !myOrdersModal.contains(event.target) && !myOrdersBtn.contains(event.target) && myOrdersModal.style.display === 'block') {
            myOrdersModal.style.display = 'none';
        }
    });
    window.onclick = (e) => {
        if (e.target == cartModal) cartModal.style.display = 'none';
        if (e.target == myOrdersModal) myOrdersModal.style.display = 'none';
    };


});

// --- 7. Load Restaurant Info ---
async function loadRestaurantInfo(adminId) {
    if (!profileDocRef) {
        console.error("Profile reference not set!");
        return null;
    }
    try {
        console.log("Attempting to fetch profile from:", profileDocRef.path);
        const docSnap = await getDoc(profileDocRef);
        if (docSnap.exists()) {
            const profile = docSnap.data();
            console.log("Profile data found:", profile);
            const name = profile.restaurantName || profile.email;
            return name;
        } else {
            console.error("No such admin profile document!");
            return null;
        }
    } catch (error) {
        console.error("Error fetching restaurant info:", error);
        if (error.code === 'permission-denied') {
            console.error("Firestore permission denied. Check your rules!");
        }
        return null;
    }
}

// --- 8. Show Different Views ---
function showError(message) {
    infoView.style.display = 'flex';
    menuView.style.display = 'none';
    infoViewContent.innerHTML = `<h2 class="text-2xl font-bold text-red-600">Error</h2><p class="text-gray-600 mt-4">${message}</p>`;
}

function showInfoForm(restaurantName) {
    infoView.style.display = 'flex';
    menuView.style.display = 'none';
    // Detach any existing order listener if going back to info form
    if (currentCustomerOrdersUnsubscribe) {
        console.log("Detaching customer order listener.");
        currentCustomerOrdersUnsubscribe();
        currentCustomerOrdersUnsubscribe = null;
    }
    infoViewContent.innerHTML = `
            <div class="text-center mb-6">
                <h1 class="text-2xl font-bold text-gray-800">Welcome to ${restaurantName}!</h1>
                <p class="text-gray-600">Please enter your details to view the menu</p>
            </div>
            <form id="customer-info-form">
                <div class="mb-4">
                    <label for="customer-name" class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" id="customer-name" class="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                </div>
                <div class="mb-4">
                    <label for="customer-phone" class="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                    <input type="tel" id="customer-phone" class="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                </div>
                <div class="mb-4">
                    <label for="table-number" class="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
                    <input type="number" id="table-number" class="w-full px-3 py-2 border border-gray-300 rounded-md" required>
                </div>
                <div class="mb-6">
                    <label for="customer-email" class="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                    <input type="email" id="customer-email" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                </div>
                <button type="submit" class="w-full bg-orange-500 text-white py-2 px-4 rounded-md font-semibold hover:bg-orange-600">
                    View Menu
                </button>
            </form>
        `;
    const infoForm = document.getElementById('customer-info-form');
    if (infoForm) {
        infoForm.addEventListener('submit', handleInfoFormSubmit);
    }
}

function showMenuView(restaurantName) {
    infoView.style.display = 'none';
    menuView.style.display = 'block';
    restaurantNameMenu.textContent = restaurantName;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("User authenticated, listening for menu and orders.");
            listenForMenu();
            listenForCustomerOrders(); // Start listening for orders
        }
        else {
            console.log("User not authenticated, attempting sign-in.");
            // Detach order listener if sign-in fails or user becomes unauthenticated
            if (currentCustomerOrdersUnsubscribe) {
                currentCustomerOrdersUnsubscribe();
                currentCustomerOrdersUnsubscribe = null;
            }
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                signInWithCustomToken(auth, __initial_auth_token)
                    .then(() => console.log("Signed in with custom token."))
                    .catch((err) => {
                        console.error("Custom token sign-in error, trying anonymous:", err);
                        signInAnonymously(auth).catch((err) => console.error("Anon sign-in error", err));
                    });
            } else {
                signInAnonymously(auth)
                    .then(() => console.log("Signed in anonymously."))
                    .catch((err) => console.error("Anon sign-in error", err));
            }
        }
    });
}

// --- 9. Handle Info Form Submit ---
function handleInfoFormSubmit(e) {
    e.preventDefault();
    const phoneInput = document.getElementById('customer-phone').value;
    const nameInput = document.getElementById('customer-name').value;
    const tableInput = document.getElementById('table-number').value;

    // Basic validation (optional)
    if (!phoneInput || !nameInput || !tableInput) {
        alert("Please fill in Name, Phone, and Table Number.");
        return;
    }

    customerPhoneNumber = phoneInput; // Store phone number globally

    const customerDetails = {
        name: nameInput,
        phone: phoneInput,
        table: tableInput,
        email: document.getElementById('customer-email').value || 'Not provided'
    };
    sessionStorage.setItem('customerDetails', JSON.stringify(customerDetails));
    showMenuView(restaurantNameMenu.textContent);
}

// --- 10. Firebase Menu Listener & Render ---
function listenForMenu() {
    if (!menuItemsCol) { /* ... */ return; }
    onSnapshot(query(menuItemsCol), (snapshot) => {
        console.log("Menu snapshot received, size:", snapshot.size);
        menuContainer.innerHTML = '';
        menuCache = {};
        if (snapshot.empty) { /* ... */ return; }
        snapshot.forEach((doc) => renderMenuItemCard(doc));
    }, (error) => { /* ... */ });
}

// --- Render Individual Menu Item Card ---
function renderMenuItemCard(doc) {
    // (Code from previous version - unchanged)
    const item = doc.data();
    const itemID = doc.id;
    menuCache[itemID] = { name: item.name, price: item.price, quantity: item.quantity ?? -1 };
    const itemArticle = document.createElement('article');
    itemArticle.className = 'mainfoodbox';
    itemArticle.setAttribute('data-item-id', itemID);
    let quantityText = '';
    const currentQty = menuCache[itemID].quantity;
    if (currentQty === 0) quantityText = `<span class="food-quantity-display qty-out-of-stock">Out of Stock</span>`;
    else if (currentQty > 0 && currentQty !== -1) quantityText = `<span class="food-quantity-display qty-low-stock">${currentQty} left</span>`;
    else quantityText = `<span class="food-quantity-display qty-in-stock">In Stock</span>`;
    itemArticle.innerHTML = `...`; // (HTML structure from previous version)
    itemArticle.innerHTML = `
            <img class="food-image" src="${item.imageUrl}" alt="${item.name}" onerror="this.src='https://placehold.co/300x200/f97316/white?text=Img+Missing'">
            <div class="food-info">
                <h3 class="food-name">${item.name}</h3>
                <h3 class="food-price"><i class="ri-money-rupee-circle-line"></i><u>${item.price}/-</u></h3>
                ${quantityText}
            </div>
            <div class="cart-control-container" id="cart-control-${itemID}"></div>
        `;
    menuContainer.appendChild(itemArticle);
    renderItemCardControl(itemID);
}

// --- Render Button or Adjuster on Item Card ---
function renderItemCardControl(itemID) {
    // (Code from previous version - unchanged)
    const controlContainer = document.getElementById(`cart-control-${itemID}`);
    if (!controlContainer) return;
    const cartItem = cart.find(i => i.id === itemID);
    const itemInStock = menuCache[itemID]?.quantity ?? -1;
    const isOutOfStock = itemInStock === 0;
    if (isOutOfStock) { controlContainer.innerHTML = `<button class="add-to-cart-initial-btn" data-id="${itemID}" disabled>Out of Stock</button>`; }
    else if (cartItem && cartItem.quantity > 0) {
        const maxReached = (itemInStock !== -1 && cartItem.quantity >= itemInStock);
        controlContainer.innerHTML = `<div class="item-qty-adjust">...</div>`; // (HTML structure from previous version)
        controlContainer.innerHTML = `
                <div class="item-qty-adjust">
                    <button data-id="${itemID}" class="item-remove-one">-</button>
                    <span>${cartItem.quantity}</span>
                    <button data-id="${itemID}" class="item-add-one" ${maxReached ? 'disabled' : ''}>+</button>
                </div>
            `;
        controlContainer.querySelector('.item-add-one').addEventListener('click', (e) => addToCart(e.target.dataset.id));
        controlContainer.querySelector('.item-remove-one').addEventListener('click', (e) => removeFromCart(e.target.dataset.id));
    } else {
        controlContainer.innerHTML = `<button class="add-to-cart-initial-btn" data-id="${itemID}">Add to Cart</button>`;
        controlContainer.querySelector('.add-to-cart-initial-btn').addEventListener('click', (e) => addToCart(e.target.dataset.id));
    }
}


// --- 11. Cart Logic
function addToCart(itemID) {
    // (Code from previous version - unchanged)
    const itemDetails = menuCache[itemID];
    if (!itemDetails) return;
    const currentStock = itemDetails.quantity;
    const cartItem = cart.find(i => i.id === itemID);
    const currentCartQty = cartItem ? cartItem.quantity : 0;
    if (currentStock !== -1 && currentCartQty >= currentStock) { alert(`Sorry, only ${currentStock} ${itemDetails.name} available.`); return; }
    if (cartItem) cartItem.quantity++;
    else cart.push({ id: itemID, name: itemDetails.name, price: itemDetails.price, quantity: 1 });
    updateCartDisplay();
    renderItemCardControl(itemID);
}

function removeFromCart(itemID) {

    const itemIndex = cart.findIndex(i => i.id === itemID);
    if (itemIndex > -1) {
        cart[itemIndex].quantity--;
        if (cart[itemIndex].quantity <= 0) cart.splice(itemIndex, 1);
    }
    updateCartDisplay();
    renderItemCardControl(itemID);
}


function updateCartDisplay() { // Updates Modal and Header Count
    cartItemsList.innerHTML = '';
    let total = 0; let itemCount = 0;
    if (cart.length === 0) {
        cartItemsList.innerHTML = '<li>No items in cart.</li>';
        cartTotalEl.textContent = 'Total: ₹0/-';
        cartItemCountEl.textContent = '0';
        placeOrderBtn.disabled = true;
        return;
    }
    cart.forEach(item => { /* ... create li ... */
        const li = document.createElement('li');
        li.innerHTML = `
                <span class="item-name">${item.name}</span>
                <div class="cart-qty-adjust">
                     <button data-id="${item.id}" class="cart-remove-one">-</button>
                     <span>${item.quantity}</span>
                     <button data-id="${item.id}" class="cart-add-one">+</button>
                </div>
                <span class="item-price">₹${item.price * item.quantity}/-</span>
            `;
        cartItemsList.appendChild(li); total += item.price * item.quantity; itemCount += item.quantity;
    });
    cartTotalEl.textContent = `Total: ₹${total}/-`;
    cartItemCountEl.textContent = itemCount;
    placeOrderBtn.disabled = false;
    cartItemsList.querySelectorAll('.cart-add-one').forEach(btn => btn.onclick = () => addToCart(btn.dataset.id));
    cartItemsList.querySelectorAll('.cart-remove-one').forEach(btn => btn.onclick = () => removeFromCart(btn.dataset.id));
}

// --- 12. Cart & Profile Modal Logic ---
if (cartBtn) cartBtn.onclick = () => { updateCartDisplay(); cartModal.style.display = 'block'; };
if (closeCartBtn) closeCartBtn.onclick = () => { cartModal.style.display = 'none'; };

// --- Profile Modal Functions ---
function toggleProfileModal() {
    if (!profileModal) return; // Add safety check
    const isVisible = profileModal.style.display === 'block';
    if (isVisible) {
        profileModal.style.display = 'none';
    } else {
        const customerDetailsString = sessionStorage.getItem('customerDetails');
        if (customerDetailsString) {
            const details = JSON.parse(customerDetailsString);
            if (profileModalName) profileModalName.textContent = details.name || 'N/A';
            if (profileModalPhone) profileModalPhone.textContent = details.phone || 'N/A';
            if (profileModalTable) profileModalTable.textContent = details.table || 'N/A';
        } else {
            if (profileModalName) profileModalName.textContent = 'Error';
            if (profileModalPhone) profileModalPhone.textContent = 'Error';
            if (profileModalTable) profileModalTable.textContent = 'Error';
        }
        profileModal.style.display = 'block';
    }
}
function handleLogout() {
    console.log("Logout clicked");
    sessionStorage.removeItem('customerDetails'); // Clear session data
    customerPhoneNumber = null; // Clear phone number state
    // Detach order listener on logout
    if (currentCustomerOrdersUnsubscribe) {
        console.log("Detaching customer order listener on logout.");
        currentCustomerOrdersUnsubscribe();
        currentCustomerOrdersUnsubscribe = null;
    }
    if (profileModal) profileModal.style.display = 'none'; // Hide modal
    location.reload(); // Reload to show info form
}


// --- NEW: Firebase Listener for Customer's Orders ---
function listenForCustomerOrders() {
    if (currentCustomerOrdersUnsubscribe) {
        console.log("Detaching existing customer order listener before creating new one.");
        currentCustomerOrdersUnsubscribe(); // Detach previous listener if any
        currentCustomerOrdersUnsubscribe = null;
    }

    if (!customerPhoneNumber) {
        console.error("Cannot listen for orders: Customer phone number not set.");
        if (myOrdersList) myOrdersList.innerHTML = '<li>Error: Could not retrieve your details.</li>';
        return;
    }
    if (!ordersCol) {
        console.error("Cannot listen for orders: Orders collection reference not set.");
        if (myOrdersList) myOrdersList.innerHTML = '<li>Error: Orders configuration issue.</li>';
        return;
    }

    console.log(`Listening for orders with phone number: ${customerPhoneNumber}`);
    // Create the query
    const q = query(ordersCol, where("customer.phone", "==", customerPhoneNumber));

    currentCustomerOrdersUnsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Customer orders snapshot received:", snapshot.size, "docs");
        if (!myOrdersList) return; // Safety check
        myOrdersList.innerHTML = ''; // Clear previous list

        if (snapshot.empty) {
            myOrdersList.innerHTML = '<li>You haven\'t placed any orders yet.</li>';;
            return;
        }

        snapshot.docs
            .sort((a, b) => (b.data().createdAt?.toDate() || 0) - (a.data().createdAt?.toDate() || 0)) // Sort newest first, handle null timestamps
            .forEach(doc => {
                const order = doc.data();
                const orderId = doc.id;
                const orderLi = document.createElement('li');
                orderLi.className = 'customer-order-item';

                let itemsHtml = '<ul>';
                let orderTotal = 0;
                if (order.items) {
                    order.items.forEach(item => {
                        const itemTotal = (item.price || 0) * (item.quantity || 0);
                        itemsHtml += `<li>
                                 <span class="oi-name">${item.name || 'Unknown'}</span>
                                 <span class="oi-qty">x ${item.quantity || 0}</span>
                                 <span class="oi-price">₹${itemTotal}/-</span>
                             </li>`;
                        orderTotal += itemTotal;
                    });
                }
                itemsHtml += '</ul>';

                const timestamp = order.createdAt?.toDate()
                    ? order.createdAt.toDate().toLocaleString()
                    : 'Timestamp unavailable';

                orderLi.innerHTML = `
                        <div class="order-item-header">
                             <span class="order-timestamp">${timestamp}</span>
                             <span class="order-status ${order.status}">${order.status || 'Unknown'}</span>
                        </div>
                        <div class="order-item-details">
                            ${itemsHtml}
                            <p class="order-item-total">Total: ₹${orderTotal}/-</p>
                        </div>
                    `;
                myOrdersList.appendChild(orderLi);
            });

    }, (error) => {
        console.error("Error listening for customer orders:", error);
        if (myOrdersList) myOrdersList.innerHTML = '<li>Could not load your orders.</li>';
        if (error.code === 'permission-denied') {
            console.error("Firestore permission denied for reading orders. Check rules!");
        } else if (error.message.includes("indexes")) {
            console.error("Firestore index missing for querying orders by phone number!");
            if (myOrdersList) myOrdersList.innerHTML = '<li>Error: Database index configuration needed. Please contact support.</li>';
        }
    });
}


// --- 13. Place Order Logic with Quantity Deduction ---
if (placeOrderBtn) placeOrderBtn.onclick = async () => { // Add safety check
    if (cart.length === 0) { alert("Your cart is empty!"); return; }

    placeOrderBtn.disabled = true;
    placeOrderBtn.textContent = 'Placing Order...';

    const customerDetails = JSON.parse(sessionStorage.getItem('customerDetails'));
    if (!ordersCol || !menuItemsColPath) {
        console.error("Orders collection or menu path reference not set!");
        alert("Configuration error. Cannot place order.");
        placeOrderBtn.disabled = false; placeOrderBtn.textContent = 'Place Order';
        return;
    }

    // --- Quantity Deduction Step ---
    try {
        const updates = []; // Array to store promises for quantity updates
        for (const cartItem of cart) {
            const menuItemRef = doc(db, menuItemsColPath, cartItem.id);
            const menuItemSnap = await getDoc(menuItemRef);

            if (menuItemSnap.exists()) {
                const menuItemData = menuItemSnap.data();
                const currentQuantity = menuItemData.quantity ?? -1;

                // Only deduct if quantity is not unlimited (-1)
                if (currentQuantity !== -1) {
                    const newQuantity = currentQuantity - cartItem.quantity;
                    if (newQuantity < 0) {
                        throw new Error(`Not enough stock for ${cartItem.name}. Only ${currentQuantity} available.`);
                    }
                    updates.push(updateDoc(menuItemRef, {
                        quantity: increment(-cartItem.quantity)
                    }));
                }
            } else {
                throw new Error(`Menu item ${cartItem.name} (ID: ${cartItem.id}) not found.`);
            }
        }

        // Wait for all quantity updates to complete
        await Promise.all(updates);
        console.log("Quantity updates successful.");

        // --- Add Order Document Step ---
        await addDoc(ordersCol, {
            customer: customerDetails,
            items: cart,
            status: "pending",
            createdAt: serverTimestamp() // Make sure serverTimestamp is imported
        });

        console.log("Order placed successfully.");
        alert("Order placed successfully!");
        cart = []; // Clear the cart array
        updateCartDisplay(); // Update modal (will show empty)
        if (cartModal) cartModal.style.display = 'none'; // Close modal
        // Manually re-render all visible item card controls to reset them to "Add to Cart"
        Object.keys(menuCache).forEach(itemId => renderItemCardControl(itemId));


    } catch (error) {
        console.error("Error during order placement or quantity update: ", error);
        alert(`Could not place order: ${error.message}. Please try again.`);
        // Note: Consider reverting quantity updates if order placement fails (requires transactions)
        if (error.code === 'permission-denied') {
            console.error("Firestore permission denied. Check your rules!");
        }
    } finally {
        // Re-enable button regardless of success or failure
        if (placeOrderBtn) {
            placeOrderBtn.disabled = false;
            placeOrderBtn.textContent = 'Place Order';
        }
    }
};