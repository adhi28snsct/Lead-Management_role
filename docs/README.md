# Lead Management System (LMS)

A complete role-based **Lead Management System** built with **Next.js** and **Firebase**, supporting multiple user roles such as **Admin**, **Team Admin**, **Master**, and **Executive**.  
The system allows secure management of **teams**, **users**, and **leads**, with permissions enforced through **Firestore Security Rules**.

---

## 🚀 Features

### 🔐 Authentication & Authorization
- Email/password login using Firebase Authentication
- Role-based routing & UI control
- Unauthorized access redirection (`/unauthorized`)

### 👥 User Roles
- **Admin**
  - Manage all teams & users
  - Assign Team Admins
  - View all leads across the system
- **Team Admin**
  - Manage users inside their team
  - CRUD operations on leads inside their team
  - Promote users to Master/Executive
- **Master**
  - Full CRUD on leads in own team
- **Executive**
  - Can only update lead **status** and **notes**

### 📋 Lead Management
Each lead contains:
- Name *(required)*
- Email *(required)*
- Contact Number *(required)*
- Source *(required)*
- Notes *(optional)*
- Status *(Pending / Contacted / In Progress / Closed Won / Closed Lost)*


### 🎨 Frontend Features
- Built with **Next.js (App Router)**
- Responsive UI
- Protected pages based on user role
- Clean components for:
  - Lead Creation
  - Lead Overview / List
  - Team Management Panel

---

## 🧱 Tech Stack

### **Frontend**
- Next.js (App Router)
- React
- TailwindCSS (`globals.css`)

### **Backend / Cloud**
- Firebase Authentication
- Cloud Firestore
- Firestore Security Rules
- Firebase Storage (optional)
- (Optional) Firebase Functions for privileged role operations

---

## 📁 Project Structure (client folder)

client/
  app/
 - components/
 - CreateTaskForm.jsx
 - LeadCreationPanel.jsx
 - LeadOverViewPanel.jsx
 - teamManagement.jsx
 - dashboard/     ---Admin Dashboard
 - page.js
 - login/        ---Login page
 - page.js
 - register/     ---Register page
 - page.js
 - tasks/        ---Executive Dashboard
 - page.js
 - teamadmin/    ---TeamAdmin Dashboard
 - page.js
 - unauthorized/ ---Unauthorized page
 - page.js
 - globals.css   ---Using TailwindCss
 - layout.js

  lib/
 - firebaseClient.js

  public/

 - .env.local
 - package.json




---

## 🔥 Firebase Configuration

All Firebase initialization logic is kept in:


Environment variables must be set in:

client/.env.local
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY_HERE
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID


firestore/datamodel

/users/{userId}
  - email
  - role                ← global role: admin, teamAdmin, master, executive
  - createdAt
  - lastLoginAt

/teams/{teamId}
  - name
  - description
  - createdBy
  - createdAt

/teams/{teamId}/members/{userId}
  - role                ← teamAdmin, master, executive
  - joinedAt

/teams/{teamId}/leads/{leadId}
  - name
  - email
  - contactNumber
  - source
  - notes
  - status
  - createdBy
  - createdAt
  - lastModified
  - lastModifiedBy

Firestore Security Rules (High-Level Summary)

Admins → Full read/write access

Team Admins → Full access within their own team

Masters → Full CRUD on leads in their team

Executives → Can only update status and notes

Users cannot access data belonging to other teams

Full details are available in ARCHITECTURE.md.

 Install Dependencies
npm install
 
 Start Development Server
npm run dev 



Pages Overview
/login

User login.

/register

User registration.

/dashboard

Main overview page for logged-in users.

/teamadmin

Team Admin panel for user/role management.

/tasks

Lead management screen — create, view, update, delete.

/unauthorized


## ☁️ Cloud Functions (server)

server/
 - functions/
 -  index.js        # assignRole + email notifications
 -    package.json



 ## 📚 Additional Documentation

- [Architecture Documentation](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)