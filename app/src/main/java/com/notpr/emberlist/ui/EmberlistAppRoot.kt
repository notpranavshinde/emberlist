package com.notpr.emberlist.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.ListAlt
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.FloatingActionButton
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.notpr.emberlist.LocalAppContainer
import com.notpr.emberlist.R
import com.notpr.emberlist.ui.screens.ActivityScreen
import com.notpr.emberlist.ui.screens.BrowseScreen
import com.notpr.emberlist.ui.screens.InboxScreen
import com.notpr.emberlist.ui.screens.ProjectScreen
import com.notpr.emberlist.ui.screens.SearchScreen
import com.notpr.emberlist.ui.screens.SettingsScreen
import com.notpr.emberlist.ui.screens.TaskDetailScreen
import com.notpr.emberlist.ui.screens.TodayScreen
import com.notpr.emberlist.ui.screens.OnboardingViewModel
import com.notpr.emberlist.ui.screens.UpcomingScreen
import com.notpr.emberlist.ui.screens.quickadd.QuickAddSheet
import com.notpr.emberlist.ui.screens.quickadd.QuickAddOrigin
import kotlinx.coroutines.launch

sealed class NavRoute(val route: String, val labelRes: Int, val icon: @Composable () -> Unit) {
    object Inbox : NavRoute("inbox", R.string.inbox, { Icon(Icons.Default.Inbox, null) })
    object Today : NavRoute("today", R.string.today, { Icon(Icons.Default.CalendarMonth, null) })
    object Upcoming : NavRoute("upcoming", R.string.upcoming, { Icon(Icons.Default.ListAlt, null) })
    object Search : NavRoute("search", R.string.search, { Icon(Icons.Default.Search, null) })
    object Browse : NavRoute("browse", R.string.browse, { Icon(Icons.Default.Menu, null) })
}

@Composable
fun EmberlistAppRoot(openTaskId: String?, onTaskOpened: () -> Unit) {
    val container = LocalAppContainer.current
    val navController = rememberNavController()
    val navItems = listOf(NavRoute.Today, NavRoute.Upcoming, NavRoute.Search, NavRoute.Browse)
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route
    val currentProjectId = currentBackStack?.arguments?.getString("projectId")
    val defaultDueToday = currentRoute == NavRoute.Today.route || currentRoute == NavRoute.Inbox.route
    val snackbarHostState = remember { SnackbarHostState() }
    val undoController = container.undoController
    val onboardingViewModel: OnboardingViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
        factory = EmberlistViewModelFactory(container)
    )
    val onboardingState by onboardingViewModel.state.collectAsState()
    val restoreState by onboardingViewModel.restoreState.collectAsState()
    var quickAddRequest by remember { mutableStateOf(QuickAddRequest()) }
    val onboardingFocused = currentRoute == NavRoute.Today.route &&
        onboardingState?.status == com.notpr.emberlist.data.onboarding.OnboardingStatus.ACTIVE &&
        !quickAddRequest.isOpen
    val onboardingBackgroundModifier = if (onboardingFocused) {
        Modifier.blur(5.dp).alpha(0.38f)
    } else {
        Modifier
    }
    val scope = rememberCoroutineScope()
    val firstTaskSavedMessage = stringResource(R.string.onboarding_saved)
    val workspaceRestoredMessage = stringResource(R.string.onboarding_restored)
    val viewUpcomingLabel = stringResource(R.string.onboarding_view_upcoming)
    val driveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        onboardingViewModel.handleAuthorizationResult(result.data)
    }

    LaunchedEffect(Unit) {
        container.onboardingAnalytics.trackAppOpened()
    }

    LaunchedEffect(currentRoute) {
        currentRoute?.let { route ->
            container.onboardingAnalytics.track("screen_viewed", mapOf("route" to analyticsRoute(route)))
        }
    }

    LaunchedEffect(restoreState) {
        if (restoreState == com.notpr.emberlist.ui.screens.OnboardingRestoreState.Success) {
            snackbarHostState.showSnackbar(workspaceRestoredMessage)
        }
    }

    fun openQuickAdd(origin: QuickAddOrigin = QuickAddOrigin.STANDARD, prefill: String = "") {
        quickAddRequest = QuickAddRequest(true, origin, prefill)
        scope.launch {
            container.onboardingAnalytics.track(
                "quick_add_opened",
                mapOf("origin" to if (origin == QuickAddOrigin.ONBOARDING) "onboarding" else "fab")
            )
        }
    }

    LaunchedEffect(openTaskId) {
        if (!openTaskId.isNullOrBlank()) {
            navController.navigate("task/$openTaskId")
            onTaskOpened()
        }
    }

    LaunchedEffect(Unit) {
        undoController.events.collect { event ->
            val result = snackbarHostState.showSnackbar(
                message = event.message,
                actionLabel = event.actionLabel,
                duration = SnackbarDuration.Short
            )
            if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) {
                event.undo()
            }
        }
    }

    Scaffold(
        topBar = { TopBar(navController) },
        bottomBar = {
            BottomBar(
                navController = navController,
                items = navItems,
                modifier = onboardingBackgroundModifier
            )
        },
        snackbarHost = {
            SnackbarHost(
                hostState = snackbarHostState
            ) { data ->
                Snackbar(
                    action = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val label = data.visuals.actionLabel
                            if (label != null) {
                                TextButton(onClick = { data.performAction() }) {
                                    Text(label)
                                }
                            }
                            IconButton(onClick = { data.dismiss() }) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Dismiss"
                                )
                            }
                        }
                    }
                ) {
                    Text(data.visuals.message)
                }
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { openQuickAdd() },
                modifier = onboardingBackgroundModifier,
                containerColor = androidx.compose.ui.graphics.Color(0xFFEE6A3C),
                contentColor = androidx.compose.ui.graphics.Color.White
            ) {
                Icon(Icons.Default.Add, contentDescription = "Quick Add")
            }
            QuickAddSheet(
                isOpen = quickAddRequest.isOpen,
                origin = quickAddRequest.origin,
                prefill = quickAddRequest.prefill,
                defaultDueToday = defaultDueToday,
                defaultProjectId = currentProjectId,
                onOpenChange = { isOpen -> quickAddRequest = quickAddRequest.copy(isOpen = isOpen) },
                onTasksSaved = { count, savedToUpcoming ->
                    onboardingViewModel.taskSaved(count)
                    if (onboardingState?.status == com.notpr.emberlist.data.onboarding.OnboardingStatus.ACTIVE) {
                        scope.launch {
                            val result = snackbarHostState.showSnackbar(
                                message = firstTaskSavedMessage,
                                actionLabel = if (savedToUpcoming) viewUpcomingLabel else null
                            )
                            if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) {
                                navController.navigate(NavRoute.Upcoming.route)
                            }
                        }
                    }
                }
            )
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = NavRoute.Today.route,
            modifier = Modifier
        ) {
            composable(NavRoute.Inbox.route) { InboxScreen(padding, navController) }
            composable(NavRoute.Today.route) {
                TodayScreen(
                    padding = padding,
                    navController = navController,
                    onboardingState = onboardingState,
                    restoreState = restoreState,
                    onAddFirstTask = {
                        onboardingViewModel.primaryClicked()
                        openQuickAdd(QuickAddOrigin.ONBOARDING)
                    },
                    onExample = { kind, value ->
                        onboardingViewModel.exampleClicked(kind)
                        openQuickAdd(QuickAddOrigin.ONBOARDING, value)
                    },
                    onRestore = {
                        onboardingViewModel.beginRestore { driveLauncher.launch(it) }
                    },
                    onUseAnotherAccount = {
                        onboardingViewModel.useAnotherAccount { driveLauncher.launch(it) }
                    },
                    onSkip = onboardingViewModel::dismiss
                )
            }
            composable(NavRoute.Upcoming.route) { UpcomingScreen(padding, navController) }
            composable(NavRoute.Browse.route) { BrowseScreen(padding, navController) }
            composable(NavRoute.Search.route) { SearchScreen(padding, navController) }
            composable("project/{projectId}") { backStack ->
                val projectId = backStack.arguments?.getString("projectId") ?: return@composable
                ProjectScreen(padding, projectId, navController)
            }
            composable("task/{taskId}") { backStack ->
                val taskId = backStack.arguments?.getString("taskId") ?: return@composable
                TaskDetailScreen(padding, taskId, navController)
            }
            composable("activity") { ActivityScreen(padding, navController) }
            composable("settings") {
                SettingsScreen(
                    padding = padding,
                    onOpenQuickAdd = {
                        navController.navigate(NavRoute.Today.route)
                        openQuickAdd()
                    },
                    onShowWelcome = {
                        onboardingViewModel.activate()
                        navController.navigate(NavRoute.Today.route)
                    }
                )
            }
        }
    }
}

private data class QuickAddRequest(
    val isOpen: Boolean = false,
    val origin: QuickAddOrigin = QuickAddOrigin.STANDARD,
    val prefill: String = ""
)

private fun analyticsRoute(route: String): String = when {
    route == NavRoute.Today.route -> "today"
    route == NavRoute.Upcoming.route -> "upcoming"
    route == NavRoute.Inbox.route -> "inbox"
    route == NavRoute.Search.route -> "search"
    route == "settings" -> "settings"
    route.startsWith("project") -> "project"
    else -> "unknown"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TopBar(navController: NavHostController) {
    val currentBackStack by navController.currentBackStackEntryAsState()
    val route = currentBackStack?.destination?.route
    val isRoot = route == NavRoute.Inbox.route ||
        route == NavRoute.Today.route ||
        route == NavRoute.Upcoming.route ||
        route == NavRoute.Search.route ||
        route == NavRoute.Browse.route
    if (!isRoot) {
        val title = when (route) {
            NavRoute.Inbox.route -> stringResource(R.string.inbox)
            NavRoute.Today.route -> stringResource(R.string.today)
            NavRoute.Upcoming.route -> stringResource(R.string.upcoming)
            NavRoute.Search.route -> stringResource(R.string.search)
            NavRoute.Browse.route -> stringResource(R.string.browse)
            else -> stringResource(R.string.app_name)
        }
        TopAppBar(
            title = { Text(title) },
            navigationIcon = {
                if (navController.previousBackStackEntry != null) {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            }
        )
    }
}

@Composable
private fun BottomBar(
    navController: NavHostController,
    items: List<NavRoute>,
    modifier: Modifier = Modifier
) {
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route
    NavigationBar(
        modifier = modifier,
        containerColor = androidx.compose.material3.MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp
    ) {
        items.forEach { item ->
            NavigationBarItem(
                selected = currentRoute == item.route,
                onClick = {
                    val popped = navController.popBackStack(item.route, inclusive = false)
                    if (!popped) {
                        navController.navigate(item.route) {
                            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                },
                icon = item.icon,
                label = { Text(stringResource(item.labelRes)) }
            )
        }
    }
}
