package com.notpr.emberlist

import android.location.Location
import com.notpr.emberlist.data.model.LocationTriggerType
import com.notpr.emberlist.location.GeofenceScheduler
import com.notpr.emberlist.location.distanceMeters
import com.notpr.emberlist.location.priorityGroup
import com.notpr.emberlist.location.rankTriggers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocationRankingTest {
    @Test
    fun rankTriggersPrefersDueAndDistance() {
        val last = Location("test").apply {
            latitude = 0.0
            longitude = 0.0
        }
        val farDue = trigger("a", dueAt = 100, lat = 10.0, lng = 10.0)
        val nearDue = trigger("b", dueAt = 50, lat = 0.1, lng = 0.1)
        val noDue = trigger("c", dueAt = null, lat = 0.1, lng = 0.1)
        val ranked = rankTriggers(listOf(farDue, nearDue, noDue), last)

        assertEquals("b", ranked.first().id)
        assertEquals("c", ranked.last().id)
    }

    @Test
    fun priorityGroupReflectsAvailableSignals() {
        val last = Location("test").apply {
            latitude = 0.0
            longitude = 0.0
        }
        val withBoth = trigger("a", dueAt = 1, lat = 1.0, lng = 1.0)
        val withDueOnly = trigger("b", dueAt = 1, lat = 0.0, lng = 0.0)
        val withDistanceOnly = trigger("c", dueAt = null, lat = 1.0, lng = 1.0)
        val withNone = trigger("d", dueAt = null, lat = 0.0, lng = 0.0)

        assertEquals(0, priorityGroup(withBoth, last))
        assertEquals(1, priorityGroup(withDueOnly, null))
        assertEquals(2, priorityGroup(withDistanceOnly, last))
        assertEquals(3, priorityGroup(withNone, null))
    }

    @Test
    fun distanceMetersReturnsPositive() {
        val last = Location("test").apply {
            latitude = 0.0
            longitude = 0.0
        }
        val trigger = trigger("a", dueAt = null, lat = 0.1, lng = 0.1)
        val distance = distanceMeters(last, trigger)
        assertTrue(distance != null && distance > 0)
    }

    private fun trigger(id: String, dueAt: Long?, lat: Double, lng: Double): GeofenceScheduler.LocationTrigger {
        return GeofenceScheduler.LocationTrigger(
            id = id,
            taskId = "t$id",
            reminderId = null,
            dueAt = dueAt,
            lat = lat,
            lng = lng,
            radiusMeters = 100,
            triggerType = LocationTriggerType.ARRIVE
        )
    }
}
