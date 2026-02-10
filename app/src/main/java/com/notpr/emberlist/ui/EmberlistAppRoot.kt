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
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.notpr.emberlist.ui.screens.UpcomingScreen
import com.notpr.emberlist.ui.screens.quickadd.QuickAddSheet

sealed class NavRoute(val route: String, val labelRes: Int, val icon: @Composable () -> Unit) {
    object Inbox : NavRoute("inbox", R.string.inbox, { Icon(Icons.Default.Inbox, null) })
    object Today : NavRoute("today", R.string.today, { Icon(Icons.Default.CalendarMonth, null) })
    object Upcoming : NavRoute("upcoming", R.string.upcoming, { Icon(Icons.Default.ListAlt, null) })
    object Search : NavRoute("search", R.string.search, { Icon(Icons.Default.Search, null) })
    object Browse : NavRoute("browse", R.string.browse, { Icon(Icons.Default.Menu, null) })
}

@Composable
fun EmberlistAppRoot(openTaskId: String?, onTaskOpened: () -> Unit) {
    val navController = rememberNavController()
    val navItems = listOf(NavRoute.Today, NavRoute.Upcoming, NavRoute.Search, NavRoute.Browse)
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route
    val currentProjectId = currentBackStack?.arguments?.getString("projectId")
    val defaultDueToday = currentRoute == NavRoute.Today.route || currentRoute == NavRoute.Inbox.route
    val snackbarHostState = remember { SnackbarHostState() }
    val undoController = LocalAppContainer.current.undoController

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
        bottomBar = { BottomBar(navController, navItems) },
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
            QuickAddSheet(
                defaultDueToday = defaultDueToday,
                defaultProjectId = currentProjectId
            )
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = NavRoute.Today.route,
            modifier = Modifier
        ) {
            composable(NavRoute.Inbox.route) { InboxScreen(padding, navController) }
            composable(NavRoute.Today.route) { TodayScreen(padding, navController) }
            composable(NavRoute.Upcoming.route) { UpcomingScreen(padding, navController) }
            composable(NavRoute.Browse.route) { BrowseScreen(padding, navController) }
            composable(NavRoute.Search.route) { SearchScreen(padding, navController) }
            composable("project/{projectId}") { backStack ->
                val projectId = backStack.arguments?.getString("projectId") ?: return@composable
                ProjectScreen(padding, projectId, navController)
            }
            composable("task/{taskId}") { backStack ->
                val taskId = backStack.arguments?.getString("taskId") ?: return@composable
                TaskDetailScreen(padding, taskId)
            }
            composable("activity") { ActivityScreen(padding, navController) }
            composable("settings") { SettingsScreen(padding) }
        }
    }
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
private fun BottomBar(navController: NavHostController, items: List<NavRoute>) {
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStack?.destination?.route
    NavigationBar(
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
