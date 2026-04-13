// Scalable user search for sharing modal
export const searchUsers = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }
    // Case-insensitive search on username or email, limit to 20 results
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ]
    }, 'username email _id').limit(20).sort({ username: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error while searching users' });
  }
};
// List all users (for sharing/collaboration UI)
export const listAllUsers = async (req, res) => {
  try {
    // Only allow authenticated users (optionally: restrict to owners/admins)
    const users = await User.find({}, 'username email _id').sort({ username: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error while listing users' });
  }
};
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import YamlFile from '../models/YamlFile.js';
import { DASHBOARD } from '../config/constants.js';

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'yamlFiles',
        select: 'title description createdAt isPublic views',
        options: { sort: { createdAt: -1 }, limit: DASHBOARD.RECENT_FILES_LIMIT }
      })
      .select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user stats
    const totalFiles = await YamlFile.countDocuments({ owner: user._id });
    const publicFiles = await YamlFile.countDocuments({ owner: user._id, isPublic: true });
    const totalViews = await YamlFile.aggregate([
      { $match: { owner: user._id } },
      { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]);

    const stats = {
      totalFiles,
      publicFiles,
      privateFiles: totalFiles - publicFiles,
      totalViews: totalViews[0]?.totalViews || 0
    };

    res.json({
      user,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching profile' });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email } = req.body;
    const updateData = {};

    if (username) {
      // Check if username is already taken by another user
      const existingUser = await User.findOne({
        username,
        _id: { $ne: req.user._id }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      updateData.username = username;
    }

    if (email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        email,
        _id: { $ne: req.user._id }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      updateData.email = email;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while updating profile' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id);

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while changing password' });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;

    const user = await User.findById(req.user._id);

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Delete all user's YAML files
    await YamlFile.deleteMany({ owner: user._id });

    // Delete user account
    await User.findByIdAndDelete(user._id);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error while deleting account' });
  }
};

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get recent files
    const recentFiles = await YamlFile.find({ owner: userId })
      .select('title description createdAt updatedAt isPublic views')
      .sort({ updatedAt: -1 })
      .limit(5);

    // Get popular files (most viewed)
    const popularFiles = await YamlFile.find({ owner: userId })
      .select('title description views isPublic createdAt')
      .sort({ views: -1 })
      .limit(5);

    // Get file stats by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const filesByMonth = await YamlFile.aggregate([
      {
        $match: {
          owner: userId,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.json({
      recentFiles,
      popularFiles,
      filesByMonth
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching dashboard data' });
  }
};