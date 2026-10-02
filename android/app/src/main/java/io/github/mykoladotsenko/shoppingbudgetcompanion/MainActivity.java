package io.github.mykoladotsenko.shoppingbudgetcompanion;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;


public final class MainActivity extends Activity {
    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private static final String LOCAL_HOST = "appassets.androidplatform.net";
    private static final String LOCAL_PATH_PREFIX = "/assets/web/";
    private static final String START_URL =
        "https://" + LOCAL_HOST + LOCAL_PATH_PREFIX + "index.html";

    private WebView webView;
    private PermissionRequest pendingCameraRequest;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        applySystemBarInsets(webView);
        configureWebView(webView);
        setContentView(webView);
        registerBackNavigation();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private void configureWebView(@NonNull WebView view) {
        boolean debuggable =
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                new WebViewAssetLoader.AssetsPathHandler(this)
            )
            .build();

        view.setWebViewClient(new LocalContentClient(assetLoader));
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(@NonNull PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(@NonNull PermissionRequest request) {
                runOnUiThread(() -> {
                    if (pendingCameraRequest == request) {
                        pendingCameraRequest = null;
                    }
                });
            }
        });
    }

    private void handleWebPermissionRequest(@NonNull PermissionRequest request) {
        if (!isTrustedLocalOrigin(request.getOrigin())
            || !requestsOnlyVideoCapture(request)) {
            request.deny();
            return;
        }

        if (checkSelfPermission(Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            return;
        }

        if (pendingCameraRequest != null) {
            pendingCameraRequest.deny();
        }

        pendingCameraRequest = request;
        requestPermissions(
            new String[] { Manifest.permission.CAMERA },
            CAMERA_PERMISSION_REQUEST
        );
    }

    private static boolean requestsOnlyVideoCapture(@NonNull PermissionRequest request) {
        String[] resources = request.getResources();
        return resources.length == 1
            && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
    }

    private static boolean isTrustedLocalOrigin(@Nullable Uri uri) {
        return uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && LOCAL_HOST.equalsIgnoreCase(uri.getHost());
    }

    private static boolean isLocalAppUri(@Nullable Uri uri) {
        if (!isTrustedLocalOrigin(uri)) {
            return false;
        }

        String path = uri.getPath();
        return path != null && path.startsWith(LOCAL_PATH_PREFIX);
    }

    private void openExternal(@NonNull Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) {
            return;
        }

        boolean allowed =
            "https".equalsIgnoreCase(scheme)
                || "http".equalsIgnoreCase(scheme)
                || "mailto".equalsIgnoreCase(scheme)
                || "tel".equalsIgnoreCase(scheme);

        if (!allowed) {
            return;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // The web app already has complete manual fallbacks for its core flow.
        }
    }

    private void applySystemBarInsets(@NonNull View view) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }

        getWindow().setDecorFitsSystemWindows(false);
        view.setOnApplyWindowInsetsListener((target, insets) -> {
            android.graphics.Insets bars = insets.getInsets(
                WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            target.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
    }

    private void registerBackNavigation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::handleBackNavigation
            );
        }
    }

    private void handleBackNavigation() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }

        finishAfterTransition();
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        @NonNull String[] permissions,
        @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != CAMERA_PERMISSION_REQUEST) {
            return;
        }

        PermissionRequest request = pendingCameraRequest;
        pendingCameraRequest = null;

        if (request == null) {
            return;
        }

        boolean granted =
            grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED
                && isTrustedLocalOrigin(request.getOrigin());

        if (granted) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            request.deny();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingCameraRequest != null) {
            pendingCameraRequest.deny();
            pendingCameraRequest = null;
        }

        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }

        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, @NonNull KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            handleBackNavigation();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private final class LocalContentClient extends WebViewClientCompat {
        private final WebViewAssetLoader assetLoader;

        private LocalContentClient(@NonNull WebViewAssetLoader assetLoader) {
            this.assetLoader = assetLoader;
        }

        @Nullable
        @Override
        public WebResourceResponse shouldInterceptRequest(
            @NonNull WebView view,
            @NonNull WebResourceRequest request
        ) {
            WebResourceResponse local =
                assetLoader.shouldInterceptRequest(request.getUrl());
            return local != null ? local : super.shouldInterceptRequest(view, request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(
            @NonNull WebView view,
            @NonNull WebResourceRequest request
        ) {
            Uri uri = request.getUrl();

            if (isLocalAppUri(uri)) {
                return false;
            }

            if (request.isForMainFrame()) {
                openExternal(uri);
                return true;
            }

            return false;
        }

        @Override
        public boolean onRenderProcessGone(
            @NonNull WebView view,
            @NonNull RenderProcessGoneDetail detail
        ) {
            view.destroy();
            webView = null;
            recreate();
            return true;
        }
    }
}
