def monitor():
    print("Monitoring agent started...")
    print("Press ENTER to simulate unauthorized access")

    while True:
        input()  # waits for you
        image_path = capture_image()
        log_event(
            "UNAUTHORIZED_ACCESS",
            {"image": image_path}
        )
        lock_system()
