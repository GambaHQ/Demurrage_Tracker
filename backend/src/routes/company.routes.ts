// Company routes
import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getCompanyById, updateCompany } from '../services/company.service';

const router = Router();

// Get current company
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const company = await getCompanyById(req.user!.companyId);
    
    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found' });
      return;
    }
    
    res.json({
      success: true,
      data: company,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update company (owner only)
router.patch('/', authenticate, authorize('owner'), async (req: Request, res: Response) => {
  try {
    const { name, abn, address, phone, hourlyRate, demurrageThresholdMinutes } = req.body;
    
    const company = await updateCompany(req.user!.companyId, {
      name,
      abn,
      address,
      phone,
      hourlyRate,
      demurrageThresholdMinutes,
    });
    
    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found' });
      return;
    }
    
    res.json({
      success: true,
      data: company,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
