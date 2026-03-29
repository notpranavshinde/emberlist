package com.notpr.emberlist.data.sync

import android.content.Context
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport
import com.google.api.client.http.ByteArrayContent
import com.google.api.client.json.gson.GsonFactory
import com.google.api.services.drive.Drive
import com.google.api.services.drive.DriveScopes
import com.google.api.services.drive.model.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class DriveFileRef(
    val id: String,
    val modifiedTimeMs: Long? = null
)

interface DriveAppDataClient {
    suspend fun listSyncFiles(name: String): List<DriveFileRef>
    suspend fun downloadPayload(fileId: String): SyncPayload?
    suspend fun uploadPayload(name: String, payload: SyncPayload, existingFileId: String?): String
}

class GoogleDriveAppDataClient(
    context: Context,
    account: GoogleSignInAccount
) : DriveAppDataClient {
    private val json = Json { ignoreUnknownKeys = true }
    private val service: Drive = Drive.Builder(
        GoogleNetHttpTransport.newTrustedTransport(),
        GsonFactory.getDefaultInstance(),
        GoogleAccountCredential.usingOAuth2(
            context.applicationContext,
            listOf(DriveScopes.DRIVE_APPDATA)
        ).apply {
            selectedAccount = account.account
        }
    )
        .setApplicationName("Emberlist")
        .build()

    override suspend fun listSyncFiles(name: String): List<DriveFileRef> = withContext(Dispatchers.IO) {
        service.files().list()
            .setSpaces("appDataFolder")
            .setQ("name = '$name' and trashed = false")
            .setFields("files(id, modifiedTime)")
            .execute()
            .files
            ?.map { file -> DriveFileRef(id = file.id, modifiedTimeMs = file.modifiedTime?.value) }
            .orEmpty()
    }

    override suspend fun downloadPayload(fileId: String): SyncPayload? = withContext(Dispatchers.IO) {
        service.files().get(fileId)
            .executeMediaAsInputStream()
            .bufferedReader()
            .use { reader ->
                reader.readText().takeIf { it.isNotBlank() }?.let(json::decodeFromString)
            }
    }

    override suspend fun uploadPayload(name: String, payload: SyncPayload, existingFileId: String?): String =
        withContext(Dispatchers.IO) {
            val metadata = File().apply {
                this.name = name
                if (existingFileId == null) parents = listOf("appDataFolder")
            }
            val content = ByteArrayContent.fromString("application/json", json.encodeToString(payload))
            val request = if (existingFileId == null) {
                service.files().create(metadata, content)
            } else {
                service.files().update(existingFileId, metadata, content)
            }
            request.setFields("id").execute().id
        }
}
