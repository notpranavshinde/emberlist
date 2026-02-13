package com.notpr.emberlist.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notpr.emberlist.data.EmberlistDatabase
import com.notpr.emberlist.data.TaskRepositoryImpl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val db = EmberlistDatabase.build(context)
        val repository = TaskRepositoryImpl(
            db.projectDao(),
            db.sectionDao(),
            db.taskDao(),
            db.reminderDao(),
            db.locationDao(),
            db.activityDao()
        )
        val scheduler = ReminderScheduler(context, repository)
        CoroutineScope(Dispatchers.IO).launch {
            scheduler.rescheduleAll()
            com.notpr.emberlist.location.GeofenceScheduler(context, repository).refresh()
        }
    }
}
