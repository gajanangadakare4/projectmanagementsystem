
"use strict";

/* =========================================
   FLOWBOARD - FRONTEND APPLICATION
   HTML + CSS + VANILLA JAVASCRIPT
========================================= */

const DB_KEY = "flowboard_database_v1";
const SESSION_KEY = "flowboard_session_v1";

const $ = selector => document.querySelector(selector);

let database = loadDatabase();
let currentUserId = sessionStorage.getItem(SESSION_KEY);
let toastTimeout;


/* =========================================
   DATABASE
========================================= */

function loadDatabase() {
    try {
        const data = JSON.parse(localStorage.getItem(DB_KEY));

        if (
            data &&
            Array.isArray(data.users) &&
            Array.isArray(data.projects) &&
            Array.isArray(data.requests)
        ) {
            return data;
        }
    } catch (error) {
        console.error("Unable to load FlowBoard data:", error);
    }

    return {
        users: [],
        projects: [],
        requests: []
    };
}

function saveDatabase() {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(database));
        return true;
    } catch (error) {
        console.error(error);
        showToast("Unable to save data. Check browser storage.");
        return false;
    }
}


/* =========================================
   HELPERS
========================================= */

function generateId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getCurrentUser() {
    return database.users.find(user => user.id === currentUserId) || null;
}

function getUserById(id) {
    return database.users.find(user => user.id === id);
}

function getProjectById(id) {
    return database.projects.find(project => project.id === id);
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function getInitials(name) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function showToast(message) {
    const toast = $("#toast");

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function showMessage(selector, message, success = false) {
    const element = $(selector);

    element.textContent = message;
    element.classList.toggle("success", success);
}


/* =========================================
   PASSWORD HASHING
========================================= */

// Local demonstration only. This is not production
// authentication. Server-side authentication is required
// to protect real user accounts.

async function hashPassword(password, saltHex) {
    if (!crypto.subtle) {
        throw new Error("Secure browser cryptography unavailable.");
    }

    const encoder = new TextEncoder();

    const salt = saltHex
        ? Uint8Array.from(
            saltHex.match(/.{1,2}/g),
            byte => parseInt(byte, 16)
        )
        : crypto.getRandomValues(new Uint8Array(16));

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: 150000,
            hash: "SHA-256"
        },
        key,
        256
    );

    const hash = Array.from(new Uint8Array(bits))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    const saltValue = Array.from(salt)
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    return {
        hash,
        salt: saltValue
    };
}


/* =========================================
   AUTHENTICATION UI
========================================= */

function showAuth(type = "login") {

    $("#authSection").classList.remove("hidden");
    $("#appSection").classList.add("hidden");

    document.querySelectorAll("[data-auth]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.auth === type
        );
    });

    $("#loginForm").classList.toggle("hidden", type !== "login");
    $("#registerForm").classList.toggle("hidden", type !== "register");
}

function showApplication() {

    const user = getCurrentUser();

    if (!user) {
        currentUserId = null;
        sessionStorage.removeItem(SESSION_KEY);
        showAuth();
        return;
    }

    $("#authSection").classList.add("hidden");
    $("#appSection").classList.remove("hidden");

    $("#sidebarName").textContent = user.name;
    $("#sidebarEmail").textContent = user.email;

    $("#sidebarAvatar").textContent = getInitials(user.name);
    $("#topAvatar").textContent = getInitials(user.name);

    $("#topUserName").textContent = user.name;
    $("#welcomeName").textContent = user.name.split(" ")[0];

    renderAll();
    navigate("dashboard");
}


/* =========================================
   REGISTER
========================================= */

async function registerUser(event) {

    event.preventDefault();

    showMessage("#registerMessage", "");

    const name = $("#registerName").value.trim();
    const email = normalizeEmail($("#registerEmail").value);
    const password = $("#registerPassword").value;

    if (name.length < 2) {
        return showMessage(
            "#registerMessage",
            "Please enter a valid name."
        );
    }

    if (password.length < 8) {
        return showMessage(
            "#registerMessage",
            "Password must contain at least 8 characters."
        );
    }

    const existingUser = database.users.find(
        user => user.email === email
    );

    if (existingUser) {
        return showMessage(
            "#registerMessage",
            "This email is already registered."
        );
    }

    try {

        const credentials = await hashPassword(password);

        const user = {
            id: generateId(),
            name,
            email,
            passwordHash: credentials.hash,
            salt: credentials.salt,
            createdAt: new Date().toISOString()
        };

        database.users.push(user);

        if (!saveDatabase()) return;

        currentUserId = user.id;

        sessionStorage.setItem(SESSION_KEY, user.id);

        $("#registerForm").reset();

        showApplication();

        showToast("Account created successfully!");

    } catch (error) {

        console.error(error);

        showMessage(
            "#registerMessage",
            "Registration failed. Use localhost or HTTPS."
        );
    }
}


/* =========================================
   LOGIN
========================================= */

async function loginUser(event) {

    event.preventDefault();

    showMessage("#loginMessage", "");

    const email = normalizeEmail($("#loginEmail").value);
    const password = $("#loginPassword").value;

    const user = database.users.find(
        item => item.email === email
    );

    if (!user) {
        return showMessage(
            "#loginMessage",
            "Invalid email or password."
        );
    }

    try {

        const credentials = await hashPassword(
            password,
            user.salt
        );

        if (credentials.hash !== user.passwordHash) {
            return showMessage(
                "#loginMessage",
                "Invalid email or password."
            );
        }

        currentUserId = user.id;

        sessionStorage.setItem(SESSION_KEY, user.id);

        $("#loginForm").reset();

        showApplication();

    } catch (error) {

        console.error(error);

        showMessage(
            "#loginMessage",
            "Unable to login. Please try again."
        );
    }
}


/* =========================================
   LOGOUT
========================================= */

function logoutUser() {

    currentUserId = null;

    sessionStorage.removeItem(SESSION_KEY);

    showAuth("login");

    showToast("You have been logged out.");
}


/* =========================================
   NAVIGATION
========================================= */

const pages = {
    dashboard: "Dashboard",
    myProjects: "My Projects",
    explore: "Explore Projects",
    requests: "Join Requests"
};

function navigate(page) {

    if (!pages[page]) return;

    Object.keys(pages).forEach(key => {

        $(`#${key}Page`).classList.toggle(
            "hidden",
            key !== page
        );

    });

    document.querySelectorAll(".nav-link").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page === page
        );

    });

    $("#pageTitle").textContent = pages[page];
}


/* =========================================
   RENDER EVERYTHING
========================================= */

function renderAll() {

    renderStatistics();
    renderProjects();
    renderJoinRequests();

}


/* =========================================
   DASHBOARD STATISTICS
========================================= */

function renderStatistics() {

    const user = getCurrentUser();

    if (!user) return;

    const ownedProjects = database.projects.filter(
        project => project.ownerId === user.id
    );

    const joinedProjects = database.projects.filter(
        project =>
            project.ownerId !== user.id &&
            project.memberIds.includes(user.id)
    );

    const pendingSent = database.requests.filter(
        request =>
            request.userId === user.id &&
            request.status === "pending"
    );

    const pendingReceived = database.requests.filter(
        request =>
            request.status === "pending" &&
            getProjectById(request.projectId)?.ownerId === user.id
    );

    $("#ownedCount").textContent = ownedProjects.length;

    $("#joinedCount").textContent = joinedProjects.length;

    $("#pendingCount").textContent = pendingSent.length;

    $("#requestBadge").textContent = pendingReceived.length;

    $("#requestBadge").classList.toggle(
        "hidden",
        pendingReceived.length === 0
    );
}


/* =========================================
   PROJECT CARD
========================================= */

function createProjectCard(project, mode) {

    const user = getCurrentUser();

    const owner = getUserById(project.ownerId);

    const isOwner = project.ownerId === user.id;

    const isMember = project.memberIds.includes(user.id);

    const existingRequest = database.requests.find(
        request =>
            request.projectId === project.id &&
            request.userId === user.id
    );

    let actionHTML = "";

    if (mode === "explore") {

        if (isMember) {

            actionHTML = `
                <span class="pill member">
                    Joined
                </span>
            `;

        } else if (existingRequest?.status === "pending") {

            actionHTML = `
                <span class="pill pending">
                    Request Pending
                </span>
            `;

        } else if (existingRequest?.status === "rejected") {

            actionHTML = `
                <span class="pill rejected">
                    Request Declined
                </span>

                <button
                    class="btn btn-secondary"
                    data-action="join"
                    data-id="${escapeHTML(project.id)}"
                >
                    Request Again
                </button>
            `;

        } else {

            actionHTML = `
                <button
                    class="btn btn-primary"
                    data-action="join"
                    data-id="${escapeHTML(project.id)}"
                >
                    Request to Join
                </button>
            `;
        }

    } else {

        actionHTML = `
            <span class="pill ${isOwner ? "owner" : "member"}">
                ${isOwner ? "Owner" : "Member"}
            </span>
        `;
    }

    return `
        <article class="project-card">

            <div class="project-top">

                <div class="project-icon">
                    ${escapeHTML(project.name.charAt(0).toUpperCase())}
                </div>

                <span class="pill">
                    ${project.memberIds.length} Members
                </span>

            </div>

            <h3>${escapeHTML(project.name)}</h3>

            <p class="project-description">
                ${escapeHTML(project.description)}
            </p>

            <div class="project-meta">
                <span>
                    Owner: ${escapeHTML(owner?.name || "Unknown")}
                </span>

                <span>
                    ${new Date(project.createdAt).toLocaleDateString()}
                </span>
            </div>

            <div class="card-actions">
                ${actionHTML}
            </div>

        </article>
    `;
}


/* =========================================
   PROJECT RENDERING
========================================= */

function emptyState(message) {

    return `
        <div class="empty-state">
            ${escapeHTML(message)}
        </div>
    `;
}

function renderProjects() {

    const user = getCurrentUser();

    if (!user) return;

    const myProjects = database.projects.filter(
        project =>
            project.ownerId === user.id ||
            project.memberIds.includes(user.id)
    );

    const otherProjects = database.projects.filter(
        project =>
            project.ownerId !== user.id &&
            !project.memberIds.includes(user.id)
    );

    const recent = [...myProjects]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3);

    $("#recentProjects").innerHTML = recent.length
        ? recent.map(project => createProjectCard(project, "mine")).join("")
        : emptyState("No projects yet. Create your first project.");

    $("#myProjects").innerHTML = myProjects.length
        ? myProjects.map(project => createProjectCard(project, "mine")).join("")
        : emptyState("You have not created or joined any projects.");

    renderExploreProjects(otherProjects);
}

function renderExploreProjects(projects) {

    const search = $("#projectSearch").value
        .trim()
        .toLowerCase();

    const filtered = projects.filter(project => {

        const content = `${project.name} ${project.description}`;

        return content.toLowerCase().includes(search);
    });

    $("#exploreProjects").innerHTML = filtered.length
        ? filtered.map(project => createProjectCard(project, "explore")).join("")
        : emptyState("No matching projects found.");
}


/* =========================================
   CREATE PROJECT
========================================= */

function createProject(event) {

    event.preventDefault();

    const name = $("#projectName").value.trim();

    const description = $("#projectDescription").value.trim();

    if (!name || !description) return;

    const user = getCurrentUser();

    const project = {
        id: generateId(),
        name,
        description,
        ownerId: user.id,
        memberIds: [user.id],
        createdAt: new Date().toISOString()
    };

    database.projects.unshift(project);

    if (!saveDatabase()) return;

    $("#projectForm").reset();

    closeProjectModal();

    renderAll();

    navigate("myProjects");

    showToast("Project created successfully.");
}

function openProjectModal() {

    $("#projectModal").classList.remove("hidden");

    $("#projectName").focus();
}

function closeProjectModal() {

    $("#projectModal").classList.add("hidden");
}


/* =========================================
   SEND JOIN REQUEST
========================================= */

function sendJoinRequest(projectId) {

    const project = getProjectById(projectId);

    const user = getCurrentUser();

    if (!project || !user) return;

    if (project.ownerId === user.id) return;

    if (project.memberIds.includes(user.id)) return;

    const existingRequest = database.requests.find(
        request =>
            request.projectId === projectId &&
            request.userId === user.id
    );

    if (existingRequest?.status === "pending") {

        showToast("Your request is already pending.");

        return;
    }

    if (existingRequest) {

        existingRequest.status = "pending";

        existingRequest.createdAt = new Date().toISOString();

    } else {

        database.requests.push({

            id: generateId(),

            projectId,

            userId: user.id,

            status: "pending",

            createdAt: new Date().toISOString()

        });
    }

    if (!saveDatabase()) return;

    renderAll();

    showToast("Join request sent successfully.");
}


/* =========================================
   REQUEST CARD
========================================= */

function createRequestCard(request, received) {

    const project = getProjectById(request.projectId);

    const requester = getUserById(request.userId);

    if (!project || !requester) return "";

    const date = new Date(
        request.createdAt
    ).toLocaleDateString();

    const statusHTML = `
        <span class="pill ${request.status}">
            ${request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </span>
    `;

    let heading = "";

    let description = "";

    let actions = "";

    if (received) {

        heading = requester.name;

        description = `wants to join ${project.name}`;

        if (request.status === "pending") {

            actions = `
                <div class="request-actions">

                    <button
                        class="btn btn-primary"
                        data-action="approve"
                        data-id="${escapeHTML(request.id)}"
                    >
                        Accept
                    </button>

                    <button
                        class="btn btn-secondary"
                        data-action="reject"
                        data-id="${escapeHTML(request.id)}"
                    >
                        Reject
                    </button>

                </div>
            `;
        }

    } else {

        heading = project.name;

        description = `Owner: ${getUserById(project.ownerId)?.name || "Unknown"}`;
    }

    return `
        <article class="request-card">

            <div class="request-main">

                <div>
                    <strong>${escapeHTML(heading)}</strong>

                    <p>${escapeHTML(description)}</p>
                </div>

                ${received ? actions : statusHTML}

            </div>

            <div class="request-footer">

                <span>${date}</span>

                ${received ? statusHTML : ""}

            </div>

        </article>
    `;
}


/* =========================================
   RENDER REQUESTS
========================================= */

function renderJoinRequests() {

    const user = getCurrentUser();

    if (!user) return;

    const received = database.requests.filter(request => {

        const project = getProjectById(request.projectId);

        return (
            project &&
            project.ownerId === user.id &&
            request.status === "pending"
        );
    });

    const sent = database.requests.filter(
        request => request.userId === user.id
    );

    $("#receivedRequests").innerHTML = received.length
        ? received.map(request => createRequestCard(request, true)).join("")
        : emptyState("No pending requests received.");

    $("#sentRequests").innerHTML = sent.length
        ? sent.map(request => createRequestCard(request, false)).join("")
        : emptyState("You have not sent any requests.");
}


/* =========================================
   ACCEPT / REJECT REQUESTS
========================================= */

function updateJoinRequest(requestId, status) {

    const request = database.requests.find(
        item => item.id === requestId
    );

    const project = request
        ? getProjectById(request.projectId)
        : null;

    const user = getCurrentUser();

    if (!request || !project || !user) return;

    // Only the project owner can decide.
    if (project.ownerId !== user.id) return;

    // Only pending requests can be processed.
    if (request.status !== "pending") return;

    if (status === "accepted") {

        if (!project.memberIds.includes(request.userId)) {

            project.memberIds.push(request.userId);
        }
    }

    request.status = status;

    if (!saveDatabase()) return;

    renderAll();

    showToast(
        status === "accepted"
            ? "Request accepted. Member added!"
            : "Join request rejected."
    );
}


/* =========================================
   EVENT LISTENERS
========================================= */

// Authentication tabs

document.querySelectorAll("[data-auth]").forEach(button => {

    button.addEventListener("click", () => {

        showAuth(button.dataset.auth);

    });
});

$("#registerForm").addEventListener(
    "submit",
    registerUser
);

$("#loginForm").addEventListener(
    "submit",
    loginUser
);

$("#logoutBtn").addEventListener(
    "click",
    logoutUser
);


// Navigation

document.querySelectorAll("[data-page]").forEach(button => {

    button.addEventListener("click", () => {

        navigate(button.dataset.page);

    });
});

document.querySelectorAll("[data-page-link]").forEach(button => {

    button.addEventListener("click", () => {

        navigate(button.dataset.pageLink);

    });
});


// Project modal

document.querySelectorAll('[data-action="create-project"]').forEach(button => {

    button.addEventListener("click", openProjectModal);

});

document.querySelectorAll('[data-action="close-modal"]').forEach(button => {

    button.addEventListener("click", closeProjectModal);

});

$("#projectForm").addEventListener(
    "submit",
    createProject
);


// Search

$("#projectSearch").addEventListener("input", () => {

    const user = getCurrentUser();

    if (!user) return;

    const projects = database.projects.filter(
        project =>
            project.ownerId !== user.id &&
            !project.memberIds.includes(user.id)
    );

    renderExploreProjects(projects);

});


// Dynamic project and request buttons

document.addEventListener("click", event => {

    const button = event.target.closest("[data-action]");

    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "join") {
        sendJoinRequest(id);
    }

    if (action === "approve") {
        updateJoinRequest(id, "accepted");
    }

    if (action === "reject") {
        updateJoinRequest(id, "rejected");
    }

});


/* =========================================
   INITIALIZATION
========================================= */

if (getCurrentUser()) {

    showApplication();

} else {

    currentUserId = null;

    sessionStorage.removeItem(SESSION_KEY);

    showAuth("login");
}
