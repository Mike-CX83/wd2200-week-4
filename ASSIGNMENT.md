# Assignment: Build a Secure API Endpoint

## Introduction

In this assignment, we will build a **secure API endpoint** using **Express.js**, **JWT-based authentication**, **role-based access control (RBAC)**, and **observability** features such as structured logging and centralized error handling. By the end, you’ll have a functional backend service that demonstrates secure authentication, role verification, request logging, and robust error management in a real-world scenario.

----

## **Working with Dev Container**

To complete this assignment in a reliable and fully configured environment, please refer to the instructions in the file: **`README-devcontainer.md`**. This guide walks you through opening the assignment in **Visual Studio Code** using a **Dev Container**, which automatically installs all necessary Python libraries and tools. Following that setup ensures that the notebook runs smoothly without manual configuration or missing dependencies. Make sure to open the **main assignment folder** in VS Code and follow the steps outlined in the Dev Container guide before starting the notebook.

----

## Starter Files

The initial code is available inside the `start` folder under the `code` folder associated with this activity.

---

## Requirements

We'll be working with Express.js, JWT, bcrypt, and Winston for logging to develop our secure API. Here's what we need to accomplish:

### Set Up the Development Environment

We need to:  

- Initialize a Node.js project using `npm` with TypeScript support.
- Install necessary dependencies, including Express.js for routing, jsonwebtoken for authentication, bcryptjs for password hashing, morgan and Winston for logging, and dotenv for environment variable management.
- Configure scripts for development and production environments.

### Build the Core Features

We need to implement the following functionalities:  

**Authentication:**  

- Implement JWT-based authentication with role verification.
- Use bcryptjs to hash passwords securely.
- Store user credentials in an in-memory store (`Map`).

**Role-Based Access Control (RBAC):**  

- Enforce role-based access on API endpoints (e.g., restrict `/secure` to `ADMIN` users).
- Use middleware to verify roles during request processing.

**Structured Logging:**  

- Log all incoming requests and errors using Winston.
- Ensure logs are stored both in the console and in files for traceability.

**Centralized Error Handling:**  

- Handle errors gracefully with centralized error-handling middleware.
- Return consistent, structured error responses.

**Observability Enhancements:**  

- Add rate-limiting using `express-rate-limit` to prevent abuse.
- Secure headers using `helmet`.

**Validation:**  

- Validate incoming requests using `express-validator`.
- Ensure only valid data is processed.

**Middleware and Security:**  

- Use `cors` for cross-origin resource sharing.
- Use `morgan` for logging HTTP requests.

### Test the Application

We need to verify:  

- The API correctly authenticates users and enforces RBAC.
- Structured logging captures all relevant request and error details.
- Errors are handled gracefully with meaningful responses.
- All tests pass successfully using tools like Postman or cURL.

---

## Deliverables

The deliverable of this assignment is a working backend service that meets all the requirements above. We need to submit:  

- The public GitHub repository containing the source code.
- Screenshots showing:
  - The API running locally.
  - Responses from API endpoints.
  - Role-based access control in action.
  - Logs captured during testing.
- A brief README file explaining how to set up and run the app locally.
- Simple documentation for the app's functionality and testing process.

---

## Conclusion

Building a Build a Secure API Endpoint using Express.js, JWT, and structured logging is an excellent way to practice creating secure and observable backend services. By completing this assignment, you've learned how to implement authentication, enforce role-based access control, optimize observability with logging, and structure a modular backend project. These skills form the foundation for developing more complex and efficient APIs in the future.