#import "AppDelegate.h"

#import <TargetConditionals.h>
#import "RCTBundleURLProvider.h"
#import "RCTDevLoadingViewSetEnabled.h"
#import <Firebase.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSLog(@"[GymlyStartup] AppDelegate didFinishLaunching entered");
#if DEBUG
  /* Skjul øverste "Bundling …%"-banner (screen recording / content). Sæt til YES hvis du vil se load-progress. */
  RCTDevLoadingViewSetEnabled(NO);
#endif
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
    NSLog(@"[GymlyStartup] Firebase configured");
  }
  self.moduleName = @"GymlyFresh";
  self.dependencyProvider = [RCTAppDependencyProvider new];
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  BOOL ok = [super application:application didFinishLaunchingWithOptions:launchOptions];
  NSLog(@"[GymlyStartup] AppDelegate super didFinishLaunching returned %d (React root created)", ok);
  return ok;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  NSURL *url = [self bundleURL];
  NSLog(@"[GymlyStartup] sourceURLForBridge → %@", url.absoluteString);
  return url;
}

- (NSURL *)bundleURL
{
  // Simulator: always load JS from Metro (also when scheme is Release), so UI code changes show up
  // without rebuilding an embedded main.jsbundle.
#if TARGET_OS_SIMULATOR
  NSURL *simURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  if (!simURL) {
    simURL = [NSURL URLWithString:@"http://127.0.0.1:8081/index.bundle?platform=ios&dev=true"];
  }
  NSLog(@"[GymlyStartup] Simulator → Metro. URL: %@", simURL.absoluteString);
  return simURL;
#elif DEBUG
  // Physical device Debug builds embed main.jsbundle in Xcode; Metro is often unreachable
  // on a real phone (wrong host IP / Metro not running) → blank white screen without this.
  NSURL *embedded = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  if (embedded != nil) {
    NSLog(@"[GymlyStartup] DEBUG device → embedded bundle. URL: %@", embedded.absoluteString);
    return embedded;
  }
  NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
  if (!bundleURL) {
    bundleURL = [NSURL URLWithString:@"http://127.0.0.1:8081/index.bundle?platform=ios&dev=true"];
  }
  NSLog(@"[GymlyStartup] DEBUG device → Metro (no embedded bundle). URL: %@", bundleURL.absoluteString);
  return bundleURL;
#else
  NSURL *embedded = [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
  NSLog(@"[GymlyStartup] RELEASE device → embedded bundle. URL: %@", embedded.absoluteString);
  return embedded;
#endif
}

@end
