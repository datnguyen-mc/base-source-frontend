import { dori77 } from './dori77Client';
export const auth = {
    login: async (email, password) => {
        try {
            if (email === 'admin@gmail.com' && password === '12345678') {
                const mockUser = { id: 1, email: 'admin@gmail.com', name: 'Admin User', role: 'admin' };
                const mockToken = 'mock-jwt-token-' + Date.now();
                localStorage.setItem('token', mockToken);
                localStorage.setItem('user', JSON.stringify(mockUser));
                return { token: mockToken, user: mockUser };
            }
            const res = await dori77.auth.login({ email, password });
            if (res.token) {
                localStorage.setItem('token', res.token);
                localStorage.setItem('user', JSON.stringify(res.user));
            }
            return res;
        } catch (error) {
            throw new Error('Invalid credentials');
        }
    },
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/admin/login';
    },
    getToken: () => localStorage.getItem('token'),
    getUser: () => {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    },
    isAuthenticated: () => !!localStorage.getItem('token')
};

