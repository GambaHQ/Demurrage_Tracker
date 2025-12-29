// Vehicle routes
import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { 
  getCompanyVehicles, 
  addVehicle, 
  updateVehicle, 
  deleteVehicle,
  updateSessionVehicle,
  getActiveSession,
} from '../services/session.service';

const router = Router();

// Get company vehicles
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const vehicles = await getCompanyVehicles(req.user!.companyId);
    
    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add vehicle (admin/owner only)
router.post('/', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { truckRego, trailerRego, description } = req.body;
    
    if (!truckRego) {
      res.status(400).json({ success: false, error: 'Truck rego required' });
      return;
    }
    
    const vehicle = await addVehicle(
      req.user!.companyId,
      truckRego,
      trailerRego,
      description
    );
    
    res.status(201).json({
      success: true,
      data: vehicle,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update vehicle (admin/owner only)
router.patch('/:vehicleId', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    const { truckRego, trailerRego, description, isActive } = req.body;
    
    const vehicle = await updateVehicle(vehicleId, {
      truckRego,
      trailerRego,
      description,
      isActive,
    });
    
    if (!vehicle) {
      res.status(404).json({ success: false, error: 'Vehicle not found' });
      return;
    }
    
    res.json({
      success: true,
      data: vehicle,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete vehicle (admin/owner only)
router.delete('/:vehicleId', authenticate, authorize('owner', 'admin'), async (req: Request, res: Response) => {
  try {
    const { vehicleId } = req.params;
    
    await deleteVehicle(vehicleId);
    
    res.json({
      success: true,
      message: 'Vehicle deleted',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update current session vehicle (for drivers to switch vehicles)
router.post('/session', authenticate, async (req: Request, res: Response) => {
  try {
    const { truckRego, trailerRego } = req.body;
    
    if (!truckRego) {
      res.status(400).json({ success: false, error: 'Truck rego required' });
      return;
    }
    
    const session = await getActiveSession(req.user!.userId);
    if (!session) {
      res.status(400).json({ success: false, error: 'No active session' });
      return;
    }
    
    const updatedSession = await updateSessionVehicle(session.id, truckRego, trailerRego);
    
    res.json({
      success: true,
      data: {
        truckRego: updatedSession?.truckRego,
        trailerRego: updatedSession?.trailerRego,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
