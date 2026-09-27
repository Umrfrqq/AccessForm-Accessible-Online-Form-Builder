const API_URL = '/api';

async function callAPI(endpoint, method = 'GET', data = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const options = { method, headers };
    if (data) options.body = JSON.stringify(data);
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    return await response.json();
}

window.AccessFormAPI = {
    login: (email, password, role) => callAPI('/auth/login', 'POST', { email, password, role }),
    register: (data) => callAPI('/auth/register', 'POST', data),
    getForms: (token) => callAPI('/forms', 'GET', null, token),
    createForm: (data, token) => callAPI('/forms', 'POST', data, token)
};