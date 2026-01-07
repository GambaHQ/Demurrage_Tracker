// Deadhead travel tracking routes
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  startDeadheadTrip,
  getActiveDeadheadTrip,
  startBreak,
  endBreak,
  endDeadheadTrip,
  getCompletedTrips,
  getActiveBreak
} from '../services/deadhead.service';
import { query } from '../config/database';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Start a new deadhead trip
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { truckRego, trailerRego, startOdometer, latitude, longitude, address } = req.body;
    
    if (!truckRego || !startOdometer || !latitude || !longitude) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Check if there's already an active trip
    const activeTrip = await getActiveDeadheadTrip(req.user!.userId, req.user!.companyId);
    if (activeTrip) {
      res.status(400).json({ success: false, error: 'You already have an active trip. Please complete it first.' });
      return;
    }

    const trip = await startDeadheadTrip({
      companyId: req.user!.companyId,
      userId: req.user!.userId,
      truckRego,
      trailerRego,
      startOdometer: parseInt(startOdometer),
      startLocation: { latitude, longitude, address }
    });

    res.json({ success: true, data: trip });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active trip
router.get('/active', async (req: Request, res: Response) => {
  try {
    const trip = await getActiveDeadheadTrip(req.user!.userId, req.user!.companyId);
    
    if (!trip) {
      res.json({ success: true, data: null });
      return;
    }

    // Also check if there's an active break
    const activeBreak = await getActiveBreak(trip.id);

    res.json({ 
      success: true, 
      data: {
        trip,
        activeBreak
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start a break
router.post('/break/start', async (req: Request, res: Response) => {
  try {
    const { tripId, latitude, longitude, address } = req.body;
    
    if (!tripId || !latitude || !longitude) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Verify the trip belongs to the user
    const trip = await getActiveDeadheadTrip(req.user!.userId, req.user!.companyId);
    if (!trip || trip.id !== tripId) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    // Check if there's already an active break
    const activeBreak = await getActiveBreak(tripId);
    if (activeBreak) {
      res.status(400).json({ success: false, error: 'A break is already in progress' });
      return;
    }

    const breakRecord = await startBreak({
      tripId,
      startLocation: { latitude, longitude, address }
    });

    res.json({ success: true, data: breakRecord });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End a break
router.post('/break/end', async (req: Request, res: Response) => {
  try {
    const { breakId, latitude, longitude, address } = req.body;
    
    if (!breakId || !latitude || !longitude) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    const breakRecord = await endBreak({
      breakId,
      endLocation: { latitude, longitude, address }
    });

    res.json({ success: true, data: breakRecord });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End the trip
router.post('/end', async (req: Request, res: Response) => {
  try {
    const { tripId, endOdometer, latitude, longitude, address } = req.body;
    
    if (!tripId || !endOdometer || !latitude || !longitude) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }

    // Verify the trip belongs to the user
    const activeTrip = await getActiveDeadheadTrip(req.user!.userId, req.user!.companyId);
    if (!activeTrip || activeTrip.id !== tripId) {
      res.status(404).json({ success: false, error: 'Trip not found' });
      return;
    }

    // End any active break first
    const activeBreak = await getActiveBreak(tripId);
    if (activeBreak) {
      await endBreak({
        breakId: activeBreak.id,
        endLocation: { latitude, longitude, address }
      });
    }

    const trip = await endDeadheadTrip({
      tripId,
      endOdometer: parseInt(endOdometer),
      endLocation: { latitude, longitude, address }
    });

    res.json({ success: true, data: trip });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get completed trips (for invoicing)
router.get('/trips', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const trips = await getCompletedTrips(req.user!.companyId, {
      startDate: startDate as string,
      endDate: endDate as string,
      userId: userId as string
    });

    res.json({ success: true, data: trips });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all trips for company (for clearing data)
router.delete('/trips/clear', async (req: Request, res: Response) => {
  try {
    // Delete all deadhead trips and breaks for the company
    await query(
      'DELETE FROM deadhead_breaks WHERE trip_id IN (SELECT id FROM deadhead_trips WHERE company_id = $1)',
      [req.user!.companyId]
    );
    
    await query(
      'DELETE FROM deadhead_trips WHERE company_id = $1',
      [req.user!.companyId]
    );

    res.json({ success: true, message: 'All deadrunning trips cleared' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
