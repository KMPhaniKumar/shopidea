# Document 2 — Product Architecture & Complete App Workflow
### Version 1.0 | Date: April 2026

---

## 1. Platform Overview

The platform has 3 sides:
- **Seller App** — manage store, products, orders
- **Buyer App** — discover, browse, order
- **Admin Dashboard** — platform management, analytics, support

---

## 2. Complete Seller Workflow

### 2.1 Onboarding Flow
```
Download app
  → Enter mobile number
  → OTP verification (30 seconds)
  → Enter shop name
  → Select category (food / jewellery / clothing / other)
  → Upload shop photo or logo
  → Enter city and area
  → Store is LIVE instantly
  → Platform generates unique store link → yourshopname.platform.com
```

### 2.2 Add Products Flow
```
Click "Add Product"
  → Upload product photo from gallery (up to 5 photos)
  → Enter product name
  → Enter price
  → Enter description (optional)
  → Set stock quantity (or mark as unlimited)
  → Add variants — size / color / flavor / weight
  → Set variant prices if different
  → Mark as available or out of stock
  → Save → Product live on storefront instantly
```

### 2.3 Share Store Flow
```
Go to "My Store" tab
  → See store link → yourshopname.platform.com
  → One tap → Share to WhatsApp contacts
  → One tap → Copy link for Instagram bio
  → Generate QR code → Print and stick on packaging
  → Share link in WhatsApp groups
  → Platform tracks how many people clicked from each channel
```

### 2.4 Receive and Manage Orders Flow
```
New order placed by buyer
  → Seller gets instant push notification + WhatsApp alert
  → Opens order in dashboard
  → Sees: buyer name, items ordered, quantity, amount, delivery address
  → Clicks ACCEPT or REJECT (with reason)
  → If accepted → buyer notified automatically
  → Seller marks order as "Preparing"
  → Seller marks order as "Ready for pickup"
  → Platform notifies courier for pickup (via Shiprocket/Delhivery)
  → Courier arrives → picks up
  → Seller marks as "Handed to courier"
  → Tracking link sent to buyer automatically
```

### 2.5 Payment Flow
```
Buyer places order and pays online (UPI / card / netbanking)
  → Payment held by platform (escrow via Razorpay)
  → Order delivered and confirmed by buyer
  → Payment released to seller within 24-48 hours
  → Seller sees payment in dashboard
  → Weekly settlement to seller's bank account
  → Seller downloads payment report anytime
```

### 2.6 Seller Dashboard — What Seller Sees Daily
```
HOME SCREEN
├── Today's orders (pending / accepted / shipped / delivered)
├── Today's revenue
├── New messages from buyers
├── Low stock alerts
└── Quick actions — Add product / Share store / View orders

ORDERS TAB
├── All orders with status
├── Filter by — today / this week / pending / completed
├── Each order — full details, buyer contact, items, payment status
└── One click to book delivery

PRODUCTS TAB
├── All products listed
├── Edit / delete / hide products
├── Stock management
└── Add new product

STORE TAB
├── Store link — copy and share
├── QR code download
├── Store preview — see how buyers see it
└── Edit store name, photo, description

ANALYTICS TAB
├── Revenue — daily / weekly / monthly chart
├── Top selling products
├── Total orders count
├── Repeat customers vs new customers
├── Which channel brought most buyers (WhatsApp / Instagram)
└── Buyers who installed app via your link

CUSTOMERS TAB
├── All buyers who ordered from you
├── Order history per buyer
├── Buyer contact (in-app messaging only, no personal number shared)
└── Send broadcast to all customers (premium feature)

PAYOUTS TAB
├── Pending payout amount
├── Completed payouts history
├── Bank account details
└── Download transaction report
```

---

## 3. Complete Buyer Workflow

### 3.1 First Time Buyer — Via Seller Link
```
Receives seller's store link on WhatsApp / sees in Instagram bio
  → Clicks link → opens in mobile browser
  → Sees beautiful storefront — products, photos, prices, seller rating
  → Browses products
  → Clicks product → sees full details, photos, variants
  → Clicks "Add to Cart"
  → Selects variant (size / color / flavor)
  → Sees cart
  → Platform shows banner →
     "Install app for FREE delivery on first order + ₹50 cashback"
  → Buyer clicks Install
  → Redirected to Play Store / App Store
  → Downloads app (or continues on web — both supported)
  → Opens app → Enter phone number → OTP → Done (30 seconds)
  → Automatically returns to cart with items saved
  → Enters delivery address
  → Selects payment — UPI / card / COD
  → Pays
  → Order confirmed
  → WhatsApp message sent with order details
  → Tracking link sent when shipped
  → Delivery done
  → Review request sent
```

### 3.2 Returning Buyer — Discovery Flow
```
Opens app
  → Home screen shows:
     → "From [Seller Name] you last ordered" → reorder button
     → "People who ordered from [Seller] also love" → similar sellers
     → Trending near you in Hyderabad
     → New sellers in your area
     → Top rated this week
     → Browse by category
  → Buyer discovers new sellers
  → Places new orders
  → Habit formed
```

### 3.3 Buyer Discovery & Search Flow
```
Taps Search
  → Type "homemade cake Hyderabad"
  → OR browse categories:
     Homemade Food | Jewellery | Clothing | Organic | Crafts | Plants | Skincare
  → Filter results by:
     → Rating (4+ stars)
     → Distance (within 5km / 10km / citywide)
     → Delivery time (same day / next day / standard)
     → Price range
     → Verified sellers only
  → See seller cards with:
     → Seller photo and name
     → Rating and review count
     → Location and delivery time
     → Sample products with prices
     → "Top Rated" / "New Seller" / "Verified" badges
  → Tap seller → open full store
  → Browse and order
```

### 3.4 Order Tracking Flow
```
Order placed
  → Status 1: Order Confirmed (immediate)
  → Status 2: Seller Preparing (seller accepts)
  → Status 3: Ready for Pickup (seller marks ready)
  → Status 4: Picked Up by Courier (courier scans)
  → Status 5: In Transit (live tracking link active)
  → Status 6: Out for Delivery
  → Status 7: Delivered
  → Each status change → WhatsApp notification to buyer
  → Live map tracking where available (Delhivery / Dunzo)
```

### 3.5 Review and Rating Flow
```
Order marked delivered
  → 2 hours later → push notification + WhatsApp
     "How was your order from [Seller Name]?"
  → Buyer rates 1-5 stars on:
     → Product quality
     → Packaging
     → Delivery speed
     → Overall experience
  → Optional: Upload photo of product received
  → Optional: Write review text
  → Submit → Review live on seller profile
  → Buyer earns 10 loyalty coins for leaving review
  → Photo review earns 20 coins
```

### 3.6 Buyer Home Screen Layout
```
TOP BAR
├── Location selector — "Hyderabad, Banjara Hills ▼"
├── Search bar
└── Notifications bell + Cart icon

HERO SECTION
└── "Free delivery on your first order 🎉" (for new users)
    OR loyalty coins balance for returning users

QUICK CATEGORIES
└── 🎂 Food | 💍 Jewellery | 👗 Clothing | 🌿 Organic | 🎨 Crafts

YOUR SELLERS (personalized)
└── Sellers you follow / ordered from before → reorder button

TRENDING NEAR YOU
└── Top ordered sellers in your area this week

NEW ARRIVALS
└── Sellers who just joined in your city

OCCASIONS (contextual)
└── "Diwali in 10 days — gift ideas 🪔" (seasonal)
    OR "Weekend special homemade treats 🍪"

TOP RATED
└── Highest rated sellers in your city
```

---

## 4. WhatsApp Bot Flow (Phase 2)

```
Buyer messages seller's WhatsApp Business number
  → Bot replies instantly:
     "Hi! Welcome to [Shop Name] 👋
      Here is what we have today:"
  → Shows product list with emoji, name, price
     "🎂 Chocolate Cake — ₹450
      🎂 Vanilla Cake — ₹400
      🍪 Assorted Cookies — ₹250
      
      Reply with the number to order!"
  → Buyer replies "1"
  → Bot: "Great choice! Chocolate Cake ₹450
          Which size?
          1. 500g — ₹450
          2. 1kg — ₹800"
  → Buyer: "2"
  → Bot: "1kg Chocolate Cake — ₹800
          Your order total: ₹800 + delivery
          
          Confirm? Reply YES"
  → Buyer: "YES"
  → Bot: "Enter your delivery address:"
  → Buyer types address
  → Bot sends payment link via Razorpay
  → Buyer pays
  → Bot: "Order confirmed! 🎉
          Order #1234
          Expected delivery: Tomorrow by 6pm
          Track here: [link]"
  → Seller dashboard updated automatically
  → Zero manual work for seller
```

---

## 5. Admin Dashboard Workflow

```
OVERVIEW
├── Total sellers (active / new today)
├── Total buyers (active / new today)
├── Total orders today
├── Total GMV (Gross Merchandise Value)
├── Platform revenue today
└── City-wise breakdown

SELLER MANAGEMENT
├── Approve / reject new sellers
├── View seller details and store
├── Flag / suspend sellers with complaints
├── See top sellers by GMV
└── Send announcements to all sellers

BUYER MANAGEMENT
├── View all buyers
├── Resolve buyer complaints
├── Issue refunds
└── See top buyers by spend

ORDER MANAGEMENT
├── View all orders across platform
├── Intervene in disputes
├── Track delivery issues
└── Override order status if needed

DELIVERY MANAGEMENT
├── Monitor Shiprocket / Delhivery API health
├── See failed delivery attempts
├── Resolve stuck deliveries
└── Cost per delivery report

PAYMENTS
├── Escrow balance
├── Pending seller payouts
├── Completed payouts
├── Razorpay settlement report
└── Refunds issued

ANALYTICS
├── City-wise growth
├── Category-wise GMV
├── Seller acquisition source
├── Buyer acquisition source (which seller link drove install)
├── Retention cohorts
└── Revenue forecast
```

---

## 6. Key Platform Rules

| Rule | Detail |
|---|---|
| Seller verification | Mobile OTP + optional Aadhaar for verified badge |
| Buyer protection | Escrow — money held till delivery confirmed |
| Returns | Buyer raises return within 24 hours of delivery |
| Refunds | Auto refund if seller rejects order or delivery fails |
| Dispute resolution | Admin team reviews within 24 hours |
| Fake reviews | Only buyers who placed verified orders can review |
| Seller suspension | 3 unresolved complaints = automatic review |

---

## 7. Notification Strategy

| Event | Channel |
|---|---|
| New order for seller | Push + WhatsApp |
| Order accepted for buyer | WhatsApp |
| Order shipped | WhatsApp + Push |
| Delivery done | WhatsApp + Push |
| Payment received by seller | Push |
| New product from followed seller | Push |
| Cashback earned | Push |
| Low stock alert for seller | Push |

---

*Document 2 of 4 — Next: Tech Stack & Integration Costs*
