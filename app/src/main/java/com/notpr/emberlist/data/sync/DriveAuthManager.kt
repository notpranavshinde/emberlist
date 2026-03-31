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

data class DriveAuthResult(
    val state: DriveAuthState,
    val errorMessage: String? = null
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

    suspend fun handleSignInResult(data: Intent?): DriveAuthResult {
        var errorMessage: String? = null
        val account = try {
            GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)
        } catch (error: ApiException) {
            errorMessage = buildString {
                append("Google sign-in failed")
                error.statusCode.takeIf { it != 0 }?.let { append(" (code ").append(it).append(')') }
                error.statusMessage?.takeIf { it.isNotBlank() }?.let { append(": ").append(it) }
            }
            null
        } catch (error: Exception) {
            errorMessage = error.message ?: "Google sign-in failed."
            null
        }
        val resolvedAccount = when {
            account == null -> null
            hasDriveAccess(account) -> account
            else -> runCatching { signInClient.silentSignIn().await() }.getOrNull()
                ?: GoogleSignIn.getLastSignedInAccount(context)
                ?: account
        }
        val state = snapshot(resolvedAccount)
        _state.value = state
        return DriveAuthResult(
            state = state,
            errorMessage = when {
                state.hasDriveScope -> null
                errorMessage != null -> errorMessage
                state.isSignedIn -> "Google account connected, but Drive access is still missing."
                else -> "Google sign-in did not return a usable account."
            }
        )
    }

    suspend fun disconnect(): DriveAuthState {
        runCatching { signInClient.revokeAccess().await() }
        runCatching { signInClient.signOut().await() }
        _state.value = DriveAuthState()
        return _state.value
    }

    fun getAuthorizedAccount(): GoogleSignInAccount? {
        val account = GoogleSignIn.getLastSignedInAccount(context)
        return if (account != null && hasDriveAccess(account)) account else null
    }

    private fun snapshot(accountOverride: GoogleSignInAccount? = null): DriveAuthState {
        val account = accountOverride ?: GoogleSignIn.getLastSignedInAccount(context)
        val hasDriveScope = account != null && hasDriveAccess(account)
        return DriveAuthState(
            isSignedIn = account != null,
            hasDriveScope = hasDriveScope,
            email = account?.email,
            displayName = account?.displayName
        )
    }

    private fun hasDriveAccess(account: GoogleSignInAccount): Boolean {
        return GoogleSignIn.hasPermissions(account, driveScope) ||
            account.grantedScopes.any { it.scopeUri == driveScope.scopeUri }
    }
}
