// Authentication routes
import { Router, Request, Response } from 'express';
import { 
  findUserByEmail, 
  verifyPassword, 
  registerCompany,
  createInvitation,
  acceptInvitation,
  getInvitationByToken,
  getCompanyUsers,
  getPendingInvitations,
  updateUser,
  createPasswordResetToken,
  resetPassword,
} from '../services/auth.service';
import { createSession, endSession } from '../services/session.service';
import { authenticate, authorize, generateToken, generateRefreshToken } from '../middleware/auth';
import { AuthTokenPayload } from '../types';

const router = Router();

// Register new company
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { companyName, email, password, firstName, lastName, abn, phone } = req.body;
    
    if (!companyName || !email || !password || !firstName || !lastName) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }
    
    const { company, user } = await registerCompany({
      companyName,
      email,
      password,
      firstName,
      lastName,
      abn,
      phone,
    });
    
    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      companyId: company.id,
      role: user.role,
      email: user.email,
    };
    
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    
    res.status(201).json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
        },
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, truckRego, trailerRego } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }
    
    const user = await findUserByEmail(email);
    
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    
    const isValid = await verifyPassword(password, user.passwordHash);
    
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }
    
    // Create session with vehicle info
    const session = await createSession(user.id, truckRego, trailerRego);
    
    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
    };
    
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    
    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        sessionId: session.id,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        company: {
          id: user.companyId,
          name: user.companyName,
        },
        vehicle: {
          truckRego: session.truckRego,
          trailerRego: session.trailerRego,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId) {
      await endSession(sessionId);
    }
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: req.user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Invite user (admin/owner only)
router.post('/invite', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    
    if (!email || !role) {
      res.status(400).json({ success: false, error: 'Email and role required' });
      return;
    }
    
    if (!['admin', 'driver'].includes(role)) {
      res.status(400).json({ success: false, error: 'Invalid role. Must be admin or driver' });
      return;
    }
    
    const invitation = await createInvitation(req.user!.companyId, req.user!.userId, {
      email,
      role,
    });
    
    res.status(201).json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
        },
        inviteLink: `/accept-invite?token=${invitation.token}`,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get invitation details (for invite acceptance page)
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const invitation = await getInvitationByToken(token);
    
    if (!invitation) {
      res.status(404).json({ success: false, error: 'Invalid or expired invitation' });
      return;
    }
    
    res.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        companyName: invitation.companyName,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Accept invitation
router.post('/accept-invite', async (req: Request, res: Response) => {
  try {
    const { token, password, firstName, lastName } = req.body;
    
    if (!token || !password || !firstName || !lastName) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    
    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }
    
    const user = await acceptInvitation(token, password, firstName, lastName);
    
    const tokenPayload: AuthTokenPayload = {
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
    };
    
    const authToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    
    res.status(201).json({
      success: true,
      data: {
        token: authToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get company users (admin/owner only)
router.get('/users', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const users = await getCompanyUsers(req.user!.companyId);
    
    res.json({
      success: true,
      data: users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending invitations (admin/owner only)
router.get('/invitations', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const invitations = await getPendingInvitations(req.user!.companyId);
    
    res.json({
      success: true,
      data: invitations.map(i => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user (admin/owner only)
router.patch('/users/:userId', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, role, isActive } = req.body;
    
    const user = await updateUser(userId, { firstName, lastName, role, isActive });
    
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== PASSWORD RESET =====

// Request password reset (forgot password)
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ success: false, error: 'Email is required' });
      return;
    }
    
    const result = await createPasswordResetToken(email);
    
    // Always return success to not reveal if email exists
    // TODO: Add email sending for production
    res.json({
      success: true,
      message: 'If an account exists with this email, a reset code has been sent.',
      // Include the code until email sending is implemented
      ...(result && { resetCode: result.token }),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, token, newPassword } = req.body;
    
    if (!email || !token || !newPassword) {
      res.status(400).json({ success: false, error: 'Email, reset code, and new password are required' });
      return;
    }
    
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }
    
    const success = await resetPassword(email, token, newPassword);
    
    if (!success) {
      res.status(400).json({ success: false, error: 'Invalid or expired reset code' });
      return;
    }
    
    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
