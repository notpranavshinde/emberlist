package com.notpr.emberlist.data.sync

import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import com.google.api.services.drive.DriveScopes
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.tasks.await

data class DriveAuthState(
    val isSignedIn: Boolean = false,
    val hasDriveScope: Boolean = false,
    val email: String? = null,
    val displayName: String? = null
)

class DriveAuthManager(private val context: Context) {
    private val driveScope = Scope(DriveScopes.DRIVE_APPDATA)
    private val signInClient: GoogleSignInClient by lazy {
        GoogleSignIn.getClient(
            context,
            GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestScopes(driveScope)
                .build()
        )
    }
    private val _state = MutableStateFlow(snapshot())
    val state: StateFlow<DriveAuthState> = _state.asStateFlow()

    fun signInIntent(): Intent = signInClient.signInIntent

    fun refreshState() {
        _state.value = snapshot()
    }

    suspend fun handleSignInResult(data: Intent?): DriveAuthState {
        val account = try {
            GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)
        } catch (_: Exception) {
            null
        }
        _state.value = snapshot(account)
        return _state.value
    }

    suspend fun disconnect(): DriveAuthState {
        runCatching { signInClient.revokeAccess().await() }
        runCatching { signInClient.signOut().await() }
        _state.value = DriveAuthState()
        return _state.value
    }

    fun getAuthorizedAccount(): GoogleSignInAccount? {
        val account = GoogleSignIn.getLastSignedInAccount(context)
        return if (account != null && GoogleSignIn.hasPermissions(account, driveScope)) account else null
    }

    private fun snapshot(accountOverride: GoogleSignInAccount? = null): DriveAuthState {
        val account = accountOverride ?: GoogleSignIn.getLastSignedInAccount(context)
        val hasDriveScope = account != null && GoogleSignIn.hasPermissions(account, driveScope)
        return DriveAuthState(
            isSignedIn = account != null,
            hasDriveScope = hasDriveScope,
            email = account?.email,
            displayName = account?.displayName
        )
    }
}
