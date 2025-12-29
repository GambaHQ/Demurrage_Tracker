// Tracking routes
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getActiveSession } from '../services/session.service';
import { 
  createStopEvent, 
  endStopEvent, 
  updateStopEventDetails,
  getCompanyStopEvents,
  getActiveStopEvent,
  getDemurrageEventsByWeek,
  getOrCreateWeeklyDemurrage,
} from '../services/tracking.service';
import { getCompanySettings } from '../services/company.service';

const router = Router();

// Start tracking (create stop event)
router.post('/start', authenticate, async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, address, reason } = req.body;
    
    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ success: false, error: 'Location required' });
      return;
    }
    
    // Check for existing active event
    const activeEvent = await getActiveStopEvent(req.user!.userId);
    if (activeEvent) {
      res.status(400).json({ success: false, error: 'Stop event already in progress' });
      return;
    }
    
    // Get current session
    const session = await getActiveSession(req.user!.userId);
    if (!session) {
      res.status(400).json({ success: false, error: 'No active session' });
      return;
    }
    
    const event = await createStopEvent(
      req.user!.companyId,
      req.user!.userId,
      session.id,
      { latitude, longitude, address },
      session.truckRego,
      session.trailerRego,
      reason
    );
    
    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End tracking
router.post('/end', authenticate, async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, address } = req.body;
    
    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({ success: false, error: 'Location required' });
      return;
    }
    
    // Get active event
    const activeEvent = await getActiveStopEvent(req.user!.userId);
    if (!activeEvent) {
      res.status(400).json({ success: false, error: 'No active stop event' });
      return;
    }
    
    // Get company settings for threshold
    const settings = await getCompanySettings(req.user!.companyId);
    const threshold = settings?.demurrageThresholdMinutes || 50;
    
    const event = await endStopEvent(
      activeEvent.id,
      { latitude, longitude, address },
      threshold
    );
    
    res.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update event details (notes/photos)
router.patch('/:eventId', authenticate, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { notes, photos } = req.body;
    
    const event = await updateStopEventDetails(eventId, notes, photos);
    
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    
    res.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active event
router.get('/active', authenticate, async (req: Request, res: Response) => {
  try {
    const event = await getActiveStopEvent(req.user!.userId);
    
    res.json({
      success: true,
      data: event,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get company events
router.get('/events', authenticate, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId } = req.query;
    
    const events = await getCompanyStopEvents(
      req.user!.companyId,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
      userId as string
    );
    
    res.json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get demurrage events for a week
router.get('/demurrage/:weekStart', authenticate, async (req: Request, res: Response) => {
  try {
    const { weekStart } = req.params;
    
    const events = await getDemurrageEventsByWeek(req.user!.companyId, weekStart);
    
    res.json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get weekly summary
router.get('/weekly', authenticate, async (req: Request, res: Response) => {
  try {
    const weekly = await getOrCreateWeeklyDemurrage(req.user!.companyId);
    
    res.json({
      success: true,
      data: weekly,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
