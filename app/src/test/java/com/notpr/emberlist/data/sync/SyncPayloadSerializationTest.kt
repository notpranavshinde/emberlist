package com.notpr.emberlist.data.sync

import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPayloadSerializationTest {
    @Test
    fun driveSyncPayloadSerializationIncludesDefaultFields() {
        val payload = SyncPayload(
            exportedAt = 123L,
            deviceId = "device-1",
            payloadId = "payload-1"
        )

        val encoded = syncPayloadJson.encodeToString(SyncPayload.serializer(), payload)

        assertTrue(encoded.contains("\"schemaVersion\":1"))
        assertTrue(encoded.contains("\"source\":\"android\""))
        assertTrue(encoded.contains("\"projects\":[]"))
        assertTrue(encoded.contains("\"sections\":[]"))
        assertTrue(encoded.contains("\"tasks\":[]"))
        assertTrue(encoded.contains("\"reminders\":[]"))
        assertTrue(encoded.contains("\"locations\":[]"))
    }
}
