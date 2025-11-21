# 📘 Lead Management System – API Documentation

## Overview

The API layer consists of:

1. **Firestore collection APIs** (auto-managed by Firebase SDK)
2. **Cloud Functions (server-side privileged APIs)**
3. **Client-side Firestore CRUD operations**

---

# 1. Authentication API

### **POST /login**
Handled by Firebase Auth SDK.

### **POST /register**
Also via Firebase Auth.

### **Token Structure**
Firebase issues an **ID token**:

```json
{
  "user_id": "uid",
  "role": "Admin | TeamAdmin | Master | Executive",
  "email": "user@mail.com"
}
```

Admin roles are included via **Custom Claims**.

---

# 2. Cloud Function APIs

## **2.1 Assign Role**
### `POST https://<cloud-function-url>/assignRole`

### 🔐 **Admin Only**  
Validated via Firebase token in Authorization header.

### Request
```json
{
  "uid": "targetUserId",
  "role": "Admin | TeamAdmin | Master | Executive"
}
```

### Response
```json
{
  "success": true,
  "message": "Role updated to TeamAdmin"
}
```

---

# 3. Firestore CRUD Operations

These are accessed via Firebase's client SDK:

```
import { collection, doc, getDoc, addDoc, updateDoc, deleteDoc } from "firebase/firestore"
```

---

# 3.1 Leads API

## **Create Lead**
```
POST /teams/{teamId}/leads
```
Firestore example:

```js
addDoc(collection(db, "teams", teamId, "leads"), {
  name, email, contactNumber, source, notes,
  status: "Pending",
  createdBy: uid,
  createdAt: serverTimestamp()
})
```

---

## **Update Lead**
Executives can update ONLY:
- status
- notes

Masters / TeamAdmins: full update.

```
PATCH /teams/{teamId}/leads/{leadId}
```

---

## **Delete Lead**
Only Admin + TeamAdmin + Master.

```
DELETE /teams/{teamId}/leads/{leadId}
```

---

# 4. Tasks API

## **Create Task**
```
POST /teams/{teamId}/tasks
```

Payload:

```json
{
  "title": "Follow up",
  "assignedTo": "uid",
  "assignedToName": "John",
  "deadline": "2025-02-15",
  "status": "Pending",
  "notes": "",
  "description": ""
}
```

Only **TeamAdmin** can assign tasks.

---

## **Get Tasks (Team Scope)**
```
GET /teams/{teamId}/tasks
```

Executives only see tasks assigned to them.

---

## **Update Task Status**
```
PATCH /teams/{teamId}/tasks/{taskId}
```

Executives:
- can ONLY update their assigned tasks.

---

# 5. Teams API

## **Add Member to Team**
```
POST /teams/{teamId}/members/{userId}
```

Body:
```json
{
  "role": "Executive",
  "addedBy": "teamAdminUid",
  "addedAt": "timestamp"
}
```

TeamAdmin Only.

---

# 6. Firestore Schema (Full)

See **ARCHITECTURE.md** for detailed JSON schema.

---

# 7. Notifications API (Cloud Functions)

## **sendLeadNotification**
Trigger:
```
onCreate(teams/{teamId}/leads/{leadId})
```

Sends email with lead details.

## **sendLeadStatusChangeNotification**
Trigger:
```
onUpdate(teams/{teamId}/leads/{leadId})
```

Notifies lead on status change.

---

# 8. Error Format

```json
{
  "success": false,
  "error": "Invalid or expired ID token"
}
```

---

# 9. Status Codes

| Code | Meaning |
|------|---------|
| **200** | Success |
| **400** | Client Bad Request |
| **401** | Unauthorized |
| **403** | Forbidden |
| **404** | Not Found |
| **500** | Server Error |

---

# 10. Conclusion

This API design ensures:

- strict separation of roles  
- secure team-scoped data access  
- real-time updates via Firestore  
- email notifications via Cloud Functions  
