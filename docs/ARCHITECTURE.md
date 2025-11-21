#  Lead Management System – Architecture Documentation

## Overview

The **Lead Management System (LMS)** is a role-based, team-scoped application built with:

- **Next.js (App Router)** for UI and routing  
- **Firebase Authentication** for identity  
- **Firestore** for structured, real-time data  
- **Firebase Cloud Functions** for privileged operations  
- **Firebase Emulator Suite** for development  

The system supports multiple user roles:
**Admin**, **TeamAdmin**, **Master**, **Executive** — each with increasing ability to manage the system.

---

# 1. High-Level Architecture

```
┌───────────────────────────┐        ┌────────────────────────────┐
│        Next.js UI          │ <----> │   Firebase Authentication   │
│ (client/app/**/* pages)    │        │   (login, tokens, roles)    │
└─────────────┬─────────────┘        └──────────────┬─────────────┘
              │                                      │
              │ Calls                                │ Returns
              │ Authenticated Requests               │ Custom Claims
              ▼                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cloud Firestore                         │
│-------------------------------------------------------------│
│ users/{uid}              → global roles + profile            │
│ teams/{teamId}           → team data                         │
│ teams/{teamId}/members   → team roles (TeamAdmin/Master/Exec)│
│ teams/{teamId}/leads     → leads inside a specific team      │
│ teams/{teamId}/tasks     → tasks assigned to team members    │
└─────────────────────────────────────────────────────────────┘
              │
              │ Firestore Triggers
              ▼
┌───────────────────────────────┐
│  Firebase Cloud Functions      │
│--------------------------------│
│ assignRole (HTTPS function)    │
│ sendLeadNotification (onCreate)│
│ sendStatusChangeNotification   │
└───────────────────────────────┘
```

---

# 2. System Modules

## **2.1 Authentication Flow**

- User logs in using email + password.
- Firebase issues an **ID token** containing custom claims (role).
- Next.js extracts role from `/users/{uid}`.
- Per-role routing:
  - **Admin → `/dashboard`**
  - **TeamAdmin → `/teamadmin`**
  - **Executive → `/tasks`**
  - **Unauthorized → `/unauthorized`**

---

# 3. Firestore Data Model

## **3.1 `/users/{userId}`**
Stores the global role.

```json
{
  "email": "user@mail.com",
  "role": "Admin | TeamAdmin | Master | Executive",
  "createdAt": "...",
  "lastLoginAt": "..."
}
```

---

## **3.2 `/teams/{teamId}`**
```json
{
  "name": "LeadManagement",
  "description": "Sales team",
  "createdBy": "adminUid",
  "createdAt": "timestamp"
}
```

---

## **3.3 `/teams/{teamId}/members/{userId}`**
```json
{
  "role": "TeamAdmin | Master | Executive",
  "joinedAt": "timestamp",
  "addedBy": "adminUid"
}
```

---

## **3.4 Leads: `/teams/{teamId}/leads/{leadId}`**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "contactNumber": "9876543210",
  "source": "Manual Entry | Campaign | Referral",
  "notes": "",
  "status": "Pending | Contacted | In Progress | Closed Won | Closed Lost",
  "createdBy": "teamAdminUID",
  "createdAt": "timestamp",
  "lastModified": "timestamp",
  "lastModifiedBy": "uid"
}
```

---

## **3.5 Tasks: `/teams/{teamId}/tasks/{taskId}`**

```json
{
  "title": "Follow up call",
  "assignedTo": "memberUID",
  "assignedToName": "Member Name",
  "assignedBy": "teamAdminUID",
  "assignedByName": "Admin Name",
  "deadline": "timestamp",
  "status": "Pending | In Progress | Complete",
  "notes": "",
  "description": "",
  "createdAt": "timestamp",
  "attachments": []
}
```

---

# 4. Firestore Security Rule Logic (Summary)

| Role | Team Access | Lead Access | Task Access |
|------|-------------|-------------|--------------|
| **Admin** | All teams | Full | Full |
| **TeamAdmin** | Own team only | Full | Full |
| **Master** | Own team only | Full | Full |
| **Executive** | Own team only | **Update ONLY** status/notes | Read/Update OWN tasks |

---

# 5. Cloud Functions

### **5.1 assignRole (HTTPS)**  
Admin-only API to set user roles via custom claims + Firestore update.

### **5.2 sendLeadNotification**  
Trigger:  
```
onCreate(teams/{teamId}/leads/{leadId})
```
Sends an email to the lead’s email address.

### **5.3 sendLeadStatusChangeNotification**  
Trigger:  
```
onUpdate(teams/{teamId}/leads/{leadId})
```

---

# 6. UI Layer (Next.js)

| Page | Role | Purpose |
|------|------|---------|
| `/login` | All | Login |
| `/register` | All | Registration |
| `/dashboard` | Admin | System overview |
| `/teamadmin` | TeamAdmin | Manage team members, tasks, leads |
| `/tasks` | Executive | See assigned tasks + update |
| `/unauthorized` | All | Blocked access |

---



# 7. Development Environment Architecture

Using **Firebase Emulator Suite**:

```
Auth → :9099  
Firestore → :8080  
Functions → :5001  
Emulator UI → :4000  
```

---

# 8. Conclusion

This architecture supports:

- Multi-role access  
- Real-time updates  
- Secure team-based data scoping  
- Extendable backend with Cloud Functions  

